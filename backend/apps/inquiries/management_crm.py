"""Manual CRM writes; original public submission is never rewritten."""
import csv
import io
import re
from datetime import date
from decimal import Decimal
from uuid import UUID
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, connection, transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit
from .contact import CURRENCIES, PRIORITIES, SOURCES, contact, contact_email
from .crm import filtered_leads, lead_row, locked_role
from .models import Client, Inquiry, LeadActivity
from .scope import visible_leads
from .pricing import TYPES

FIELDS = {'name','company','email','overview','service','source','priority','expectedValue','currency','expectedCloseDate','tags'}


def text(value, maximum, minimum=0):
    if not isinstance(value, str): raise ValueError
    value = value.strip()
    if not minimum <= len(value) <= maximum or '\x00' in value: raise ValueError
    value.encode('utf-8')
    return value


def parse_fields(data):
    info = {k: text(data[k], limit, minimum) for k, limit, minimum in
            [('name',120,1),('company',160,0),('email',254,1),('overview',5000,0)]}
    info['email'] = info['email'].lower()
    validate_email(info['email'])
    service = data['service']
    if not isinstance(service,str) or service not in ('', *TYPES): raise ValueError
    source, priority, currency = data['source'], data['priority'], data['currency']
    if source not in SOURCES or priority not in PRIORITIES or currency not in CURRENCIES: raise ValueError
    amount = data['expectedValue']
    if amount is not None and (not isinstance(amount,str) or not re.fullmatch(r'[0-9]{1,10}(\.[0-9]{1,2})?',amount)): raise ValueError
    close = data['expectedCloseDate']
    if close is not None:
        if not isinstance(close,str): raise ValueError
        parsed = date.fromisoformat(close)
        if parsed.isoformat()!=close or not 1900 <= parsed.year <= 9998: raise ValueError
        close = parsed
    tags = data['tags']
    if not isinstance(tags,list) or len(tags)>10: raise ValueError
    tags = [text(t,32,1) for t in tags]
    if any(',' in t for t in tags) or len(set(t.casefold() for t in tags)) != len(tags): raise ValueError
    return {'crm_contact':info,'crm_service':service,'crm_source':source,'crm_priority':priority,'crm_currency':currency,
            'crm_value':Decimal(amount) if amount is not None else None,'crm_close_date':close,'crm_tags':tags}


def lock_admission():
    # Same PostgreSQL transaction lock as the public inquiry admission path.
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(784103, 1)')


def duplicate(email, exclude=None):
    return Inquiry.objects.exclude(pk=exclude).filter(contact_email(email)).exists() or Client.objects.filter(email__iexact=email).exists()


def reference_version(data):
    if type(data['version']) is not int or not 1 <= data['version'] < 2**53 or not isinstance(data['reference'],str): raise ValueError
    return UUID(data['reference'])


def event(row, request, action, message):
    LeadActivity.objects.create(inquiry=row,actor_id=request.user.pk,action=action,message=message)
    audit('crm.'+action,request.user,subject=str(row.reference))


@json_post
@require_role('owner')
def create(request,data):
    if set(data)!=FIELDS|{'requestId','allowDuplicate'} or type(data['allowDuplicate']) is not bool: return fail('Invalid lead fields.',400)
    try:
        request_id=UUID(data['requestId']) if isinstance(data['requestId'],str) else None
        if request_id is None or request_id.version != 4: raise ValueError
        fields=parse_fields(data)
    except (ValueError,ValidationError,UnicodeError): return fail('Check contact and opportunity fields.',400)
    info=fields['crm_contact']
    # Store original create parameters as a private snapshot for idempotency, separate from edited contact.
    snapshot={k:data[k] for k in sorted(FIELDS)}
    with transaction.atomic():
        if locked_role(request)!='owner': return fail('Access denied.',403)
        lock_admission()
        existing=Inquiry.objects.filter(request_id=request_id).first()
        if existing:
            if existing.payload.get('manualCreatedBy')==request.user.pk and existing.payload.get('manualSnapshot')==snapshot:
                return JsonResponse(lead_row(existing))
            return fail('Request reference already used.',409)
        if not data['allowDuplicate'] and duplicate(info['email']):
            return JsonResponse({'error':'A lead or client with this email already exists.','code':'duplicate'},status=409)
        try:
            with transaction.atomic():
                row=Inquiry.objects.create(request_id=request_id,email=info['email'],payload={**info,'manualCreatedBy':request.user.pk,'manualSnapshot':snapshot,'discovery':None,'estimate':None},**fields)
        except IntegrityError: return fail('Request reference already used. Refresh before retrying.',409)
        event(row,request,'lead.created','Lead created manually.')
        return JsonResponse(lead_row(row),status=201)


@json_post
@require_role('owner','staff')
def edit(request,data):
    if set(data)!=FIELDS|{'reference','version','allowDuplicate'} or type(data['allowDuplicate']) is not bool: return fail('Invalid lead fields.',400)
    try: reference=reference_version(data); fields=parse_fields(data)
    except (ValueError,ValidationError,UnicodeError): return fail('Check contact and opportunity fields.',400)
    with transaction.atomic():
        role=locked_role(request)
        if not role: return fail('Access denied.',403)
        if role=='owner': lock_admission()
        row=visible_leads(request.user.pk,role).select_for_update().filter(pk=reference).first()
        if not row: return fail('Lead not found.',404)
        if row.crm_archived_at or row.crm_version!=data['version']: return fail('Lead changed or archived. Reload before editing.',409)
        email=fields['crm_contact']['email']
        if email != contact(row)['email'].lower():
            if role!='owner' or row.client_id: return fail('Email cannot be changed for this lead.',403)
            if not data['allowDuplicate'] and duplicate(email,row.pk):
                return JsonResponse({'error':'A lead or client with this email already exists.','code':'duplicate'},status=409)
        for key,value in fields.items(): setattr(row,key,value)
        row.crm_version+=1
        row.save(update_fields=[*fields,'crm_version'])
        event(row,request,'lead.edited','Contact or opportunity details updated.')
        return JsonResponse(lead_row(row))


@json_post
@require_role('owner')
def archive(request,data):
    if set(data)!={'reference','version','archived'} or type(data['archived']) is not bool: return fail('Invalid archive request.',400)
    try: reference=reference_version(data)
    except ValueError: return fail('Invalid reference.',400)
    with transaction.atomic():
        if locked_role(request)!='owner': return fail('Access denied.',403)
        row=Inquiry.objects.select_for_update().filter(pk=reference).first()
        if not row: return fail('Lead not found.',404)
        if row.crm_version!=data['version']: return fail('Lead changed. Reload before editing.',409)
        if bool(row.crm_archived_at)!=data['archived']:
            row.crm_archived_at=timezone.now() if data['archived'] else None
            row.crm_version+=1
            row.save(update_fields=['crm_archived_at','crm_version'])
            event(row,request,'lead.archived' if data['archived'] else 'lead.restored','Lead archived.' if data['archived'] else 'Lead restored.')
        return JsonResponse(lead_row(row))


def csv_cell(value):
    # Prevent spreadsheet formula execution, including leading whitespace/control characters.
    value='' if value is None else str(value)
    return "'"+value if value.lstrip().startswith(('=','+','-','@')) or value.startswith(('\t','\r','\n')) else value


@json_post
@require_role('owner','staff')
def export(request,data):
    if data or 'page' in request.GET: return fail('Invalid export request.',400)
    with transaction.atomic():
        role=locked_role(request)
        if not role: return fail('Access denied.',403)
        try: qs,_=filtered_leads(request,role)
        except ValueError as e: return fail(str(e),400)
        except PermissionError as e: return fail(str(e),403)
        rows=list(qs[:2001])
        if len(rows)>2000: return fail('Export exceeds 2000 leads. Narrow your filters.',400)
        out=io.StringIO(newline='')
        writer=csv.writer(out)
        keys=('reference','name','company','email','stage','service','source','priority','expectedValue','currency','expectedCloseDate','tags','createdAt','archived')
        writer.writerow([*keys,'assignee'])
        for row in rows:
            item=lead_row(row)
            item['tags']='; '.join(item['tags'])
            writer.writerow([csv_cell(item[k]) for k in keys]+[csv_cell(item['assignedTo']['username'] if item['assignedTo'] else '')])
        audit('crm.leads.exported',request.user)
        return HttpResponse('\ufeff'+out.getvalue(),content_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="cedar-leads.csv"'})
