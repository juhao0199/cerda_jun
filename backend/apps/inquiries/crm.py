"""Studio-internal CRM. Owner sees all; Staff sees explicitly assigned records only."""
from datetime import date, datetime, time, timedelta, timezone
from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from apps.accounts.models import AccountSecurity
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit
from django.contrib.auth import get_user_model
from .models import Client, Inquiry, LeadActivity
from .pricing import TYPES
from .scope import visible_leads, visible_clients
from .contact import contact, search_contact, SOURCES, PRIORITIES

STAGES = tuple(Inquiry.Stage.values)
TRANSITIONS = {
    'new': {'qualified', 'lost'}, 'qualified': {'new', 'proposal', 'lost'},
    'proposal': {'qualified', 'won', 'lost'}, 'lost': {'qualified'}, 'won': set(),
}
PAGE_SIZE = 25


def lead_row(row):
    info = contact(row)
    return {'reference': str(row.reference), 'name': info['name'],
            'company': info['company'], 'email': info['email'],
            'service': row.crm_service if row.crm_service is not None else (row.payload.get('discovery') or {}).get('type',''),
            'source': row.crm_source, 'priority': row.crm_priority,
            'expectedValue': str(row.crm_value) if row.crm_value is not None else None,
            'currency': row.crm_currency, 'expectedCloseDate': row.crm_close_date.isoformat() if row.crm_close_date else None,
            'tags': row.crm_tags, 'archived': row.crm_archived_at is not None,
            'stage': row.crm_stage, 'version': row.crm_version,
            'clientId': str(row.client_id) if row.client_id else None,
            'createdAt': row.created_at.isoformat(),
            'assignedTo': {'id': str(row.assigned_to_id), 'username': row.assigned_to.get_username()} if row.assigned_to_id else None}


def pagination(request, allowed):
    if set(request.GET) - allowed or any(len(request.GET.getlist(k)) != 1 for k in request.GET):
        return None
    page = request.GET.get('page', '1')
    query = request.GET.get('q', '').strip()
    if not page.isascii() or not page.isdigit() or len(page) > 4 or not 1 <= int(page) <= 1000 or len(query) > 120 or '\x00' in query:
        return None
    try: query.encode('utf-8')
    except UnicodeError: return None
    return int(page), query


def paged(qs, page, serialize):
    start = (page-1)*PAGE_SIZE
    rows = list(qs[start:start+PAGE_SIZE+1])
    return JsonResponse({'results': [serialize(row) for row in rows[:PAGE_SIZE]], 'page': page,
                         'hasMore': len(rows)>PAGE_SIZE})


@require_GET
@require_role('owner','staff')
def overview(request):
    if set(request.GET) - {'archived'} or len(request.GET.getlist('archived')) > 1 or request.GET.get('archived', '') not in ('', '1'):
        return fail('Invalid filters.',400)
    archived = request.GET.get('archived') == '1'
    if archived and request.cedar_profile.role != 'owner': return fail('Access denied.',403)
    counts = {stage: 0 for stage in STAGES}
    counts.update({row['crm_stage']: row['total'] for row in visible_leads(request.user.pk, request.cedar_profile.role).filter(crm_archived_at__isnull=not archived).values('crm_stage').annotate(total=Count('pk'))})
    return JsonResponse({'stages': counts, 'clients': visible_clients(request.user.pk, request.cedar_profile.role).count(), 'total': sum(counts.values())})


def filtered_leads(request, role):
    parsed = pagination(request, {'page','q','stage','service','from','to','source','priority','archived'})
    stage = request.GET.get('stage','')
    if parsed is None or (stage and stage not in STAGES):
        raise ValueError('Invalid filters.')
    service = request.GET.get('service', '')
    if service and service not in TYPES:
        raise ValueError('Invalid service filter.')
    try:
        bounds = []
        for key in ('from', 'to'):
            value = request.GET.get(key, '')
            parsed_date = date.fromisoformat(value) if value else None
            if parsed_date and (parsed_date.isoformat() != value or not 1900 <= parsed_date.year <= 9998):
                raise ValueError('Invalid date')
            bounds.append(parsed_date)
        start, end = bounds
        if start and end and start > end:
            raise ValueError('Invalid interval')
    except ValueError:
        raise ValueError('Invalid date filter.')
    page, query = parsed
    source, priority, archived = (request.GET.get(k, '') for k in ('source', 'priority', 'archived'))
    if (source and source not in SOURCES) or (priority and priority not in PRIORITIES) or archived not in ('', '1'):
        raise ValueError('Invalid filters.')
    if archived and role != 'owner': raise PermissionError('Access denied.')
    qs = visible_leads(request.user.pk, role).filter(crm_archived_at__isnull=not archived).select_related("assigned_to")
    if source: qs = qs.filter(crm_source=source)
    if priority: qs = qs.filter(crm_priority=priority)
    if service:
        qs = qs.filter(Q(crm_service=service)|Q(crm_service__isnull=True,payload__discovery__type=service))
    if start:
        qs = qs.filter(created_at__gte=datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:
        qs = qs.filter(created_at__lt=datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc))
    if stage: qs = qs.filter(crm_stage=stage)
    if query: qs = qs.filter(search_contact(query))
    return qs.order_by('-created_at','reference'), page


@require_GET
@require_role('owner','staff')
def leads(request):
    try: qs, page = filtered_leads(request, request.cedar_profile.role)
    except ValueError as e: return fail(str(e),400)
    except PermissionError as e: return fail(str(e),403)
    return paged(qs,page,lead_row)


@require_GET
@require_role('owner','staff')
def lead_detail(request, reference):
    row = visible_leads(request.user.pk, request.cedar_profile.role).select_related("assigned_to").filter(pk=reference).first()
    if row is None: return fail('Lead not found.',404)
    result = lead_row(row)
    result['canAssign'] = request.cedar_profile.role == 'owner' and not row.crm_archived_at
    result['canEdit'] = not bool(row.crm_archived_at)
    result['canArchive'] = request.cedar_profile.role == 'owner'
    result['canEditEmail'] = request.cedar_profile.role == 'owner' and not row.client_id
    result['overview'] = contact(row)['overview']
    result['estimate'] = row.payload.get('estimate')
    result['discovery'] = row.payload.get('discovery')
    result['allowedStages'] = [] if row.crm_archived_at else sorted(TRANSITIONS[row.crm_stage])
    result['activity'] = [{'id': str(event.pk), 'action': event.action, 'message': event.message,
                           'createdAt': event.created_at.isoformat()} for event in row.crm_activity.all()[:50]]
    return JsonResponse(result)


def locked_role(request):
    # Serialize sensitive writes against account disable/role change/revocation.
    user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
    profile = AccountSecurity.objects.select_for_update().filter(user=user).first()
    return profile.role if user.is_active and profile and profile.role in ('owner','staff') and profile.version == request.session.get('cedar_version') else None


@json_post
@require_role('owner','staff')
def update_lead(request, data):
    if set(data) != {'reference','version','stage'} or type(data['version']) is not int or not 1 <= data['version'] < 2**53 or not isinstance(data['stage'],str) or data['stage'] not in STAGES:
        return fail('Invalid update.',400)
    from uuid import UUID
    try: reference = UUID(data['reference']) if isinstance(data['reference'],str) else None
    except ValueError: reference = None
    if reference is None: return fail('Invalid reference.',400)
    with transaction.atomic():
        role = locked_role(request)
        if not role: return fail('Access denied.',403)
        row = visible_leads(request.user.pk, role).select_for_update().filter(pk=reference).first()
        if row is None: return fail('Lead not found.',404)
        if row.crm_archived_at: return fail('Restore this lead before editing.',409)
        if row.crm_version != data['version']: return fail('Lead changed. Reload before editing.',409)
        stage = data['stage']
        if stage not in TRANSITIONS[row.crm_stage]: return fail('Invalid stage transition.',409)
        old = row.crm_stage
        if stage == 'won':
            # Conversion does not provision a login or grant data access.
            info = contact(row)
            client, _ = Client.objects.get_or_create(email=info['email'].strip().lower(), defaults={
                'name':str(info['name'] or '')[:120], 'company':str(info['company'] or '')[:160]})
            row.client = client
        row.crm_stage = stage
        row.status = 'closed' if stage in ('won','lost') else ('new' if stage=='new' else 'reviewed')
        row.crm_version += 1
        row.save(update_fields=['crm_stage','status','crm_version','client'])
        LeadActivity.objects.create(inquiry=row,actor_id=request.user.pk,action='stage.changed',message=f'{old} → {stage}')
        audit('crm.stage.changed',request.user,subject=str(row.reference))
    return JsonResponse(lead_row(row))


@json_post
@require_role('owner','staff')
def add_note(request,data):
    from uuid import UUID
    if set(data) != {'reference','message','version'} or type(data['version']) is not int or not 1 <= data['version'] < 2**53 or not isinstance(data['message'],str) or not 1 <= len(data['message'].strip()) <= 1000 or '\x00' in data['message']:
        return fail('Invalid note.',400)
    try: data['message'].encode('utf-8')
    except UnicodeError: return fail('Invalid note.',400)
    try: reference = UUID(data['reference']) if isinstance(data['reference'],str) else None
    except ValueError: reference = None
    if reference is None: return fail('Invalid reference.',400)
    with transaction.atomic():
        role = locked_role(request)
        if not role: return fail('Access denied.',403)
        row = visible_leads(request.user.pk, role).select_for_update().filter(pk=reference).first()
        if row is None: return fail('Lead not found.',404)
        if row.crm_archived_at: return fail('Restore this lead before editing.',409)
        if row.crm_version != data['version']: return fail('Lead changed. Reload before editing.',409)
        row.crm_version += 1
        row.save(update_fields=['crm_version'])
        LeadActivity.objects.create(inquiry=row,actor_id=request.user.pk,action='note.added',message=data['message'].strip())
        audit('crm.note.added',request.user,subject=str(row.reference))
    return JsonResponse({'version':row.crm_version},status=201)


@require_GET
@require_role('owner','staff')
def clients(request):
    parsed = pagination(request, {'page','q'})
    if parsed is None: return fail('Invalid filters.',400)
    page, query = parsed
    qs = visible_clients(request.user.pk, request.cedar_profile.role)
    if query: qs = qs.filter(Q(email__icontains=query)|Q(name__icontains=query)|Q(company__icontains=query))
    return paged(qs.order_by('-created_at','id'),page,lambda row:{'id':str(row.pk),'name':row.name,'company':row.company,'email':row.email,'createdAt':row.created_at.isoformat()})
