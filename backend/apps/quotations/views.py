from uuid import UUID
from datetime import date
from django.db import transaction
from django.db.models import Q, OuterRef, Subquery, Count
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from apps.accounts.views import require_role, json_post, fail
from apps.accounts.security import audit
from apps.inquiries.scope import visible_leads
from apps.inquiries.crm import locked_role, pagination
from apps.inquiries.contact import contact
from .models import Quotation, Revision
from .pricing import normalize, editable, CATALOG, CURRENCIES


def scope(request, role=None):
    return Quotation.objects.filter(lead_id__in=visible_leads(request.user.pk,role or request.cedar_profile.role).values('pk'))


def number(q): return 'CC-'+q.pk.hex.upper()


def row(q):
    return {'id':str(q.pk),'number':number(q),'lead':str(q.lead_id),'version':q.version,'status':q.status,'updatedAt':q.updated_at.isoformat()}


def detail(q):
    current=q.revisions.get(version=q.version)
    return {**row(q),'snapshot':current.snapshot,'readOnly':q.lead.crm_archived_at is not None,
            'history':[{'version':r.version,'status':r.status,'createdAt':r.created_at.isoformat()} for r in q.revisions.order_by('-version')[:100]]}


def uuid(value):
    if not isinstance(value,str): raise ValueError('Invalid reference.')
    return UUID(value)


def revision(q, snapshot, user, event):
    Revision.objects.create(quotation=q,version=q.version,status=q.status,snapshot=snapshot,actor_id=user.pk)
    audit('quotation.'+event,user,subject=str(q.pk))


@require_GET
@require_role('owner','staff')
def catalog(request):
    return JsonResponse({'services':CATALOG,'currencies':CURRENCIES})


@require_GET
@require_role('owner','staff')
def listing(request):
    parsed=pagination(request,{'page','q','status','lead'})
    status=request.GET.get('status',''); lead=request.GET.get('lead','')
    if parsed is None or status not in ('','draft','issued','void'): return fail('Invalid filters.',400)
    page,query=parsed; qs=scope(request)
    counts={r['status']:r['count'] for r in qs.values('status').annotate(count=Count('pk'))}
    qs=qs.annotate(current_snapshot=Subquery(Revision.objects.filter(quotation_id=OuterRef('pk'),version=OuterRef('version')).values('snapshot')[:1]))
    if status: qs=qs.filter(status=status)
    if lead:
        try: qs=qs.filter(lead_id=uuid(lead))
        except ValueError: return fail('Invalid lead.',400)
    if query:
        filters=Q(current_snapshot__title__icontains=query)|Q(current_snapshot__recipient__name__icontains=query)|Q(current_snapshot__recipient__company__icontains=query)|Q(current_snapshot__recipient__email__icontains=query)
        try: filters |= Q(pk=uuid(query.removeprefix('CC-')))
        except ValueError: pass
        qs=qs.filter(filters)
    start=(page-1)*25; entries=list(qs.order_by('-updated_at','id')[start:start+26])
    return JsonResponse({'results':[{**row(q),'title':q.current_snapshot['title'],'recipient':q.current_snapshot['recipient']['name'],'currency':q.current_snapshot['currency'],'total':q.current_snapshot['total']} for q in entries[:25]],'page':page,'hasMore':len(entries)>25,'counts':{k:counts.get(k,0) for k in ('draft','issued','void')}})


@require_GET
@require_role('owner','staff')
def get_quote(request, reference):
    q=scope(request).select_related('lead').filter(pk=reference).first()
    return JsonResponse(detail(q)) if q else fail('Quotation not found.',404)


@json_post
@require_role('owner','staff')
def create(request,data):
    try:
        if set(data)!={'id','lead','fields'}: raise ValueError('Invalid fields.')
        ref=uuid(data['id']); lead_id=uuid(data['lead']); fields=normalize(data['fields'])
    except (ValueError,UnicodeError,TypeError): return fail('Invalid quotation data.',400)
    with transaction.atomic():
        role=locked_role(request)
        if not role: return fail('Access denied.',403)
        lead=visible_leads(request.user.pk,role).select_for_update().filter(pk=lead_id).first()
        if not lead: return fail('Lead not found.',404)
        if lead.crm_archived_at: return fail('Restore lead before quoting.',409)
        q,created=Quotation.objects.get_or_create(pk=ref,defaults={'lead':lead})
        if not created:
            if q.lead_id!=lead_id: return fail('Request conflict.',409)
            first=q.revisions.get(version=1)
            if editable(first.snapshot)!=editable(fields): return fail('Request conflict.',409)
            return JsonResponse(detail(q))
        info=contact(lead); fields['recipient']={k:str(info.get(k) or '') for k in ('name','company','email')}
        revision(q,fields,request.user,'create')
        return JsonResponse(detail(q),status=201)


@json_post
@require_role('owner','staff')
def change(request,data):
    try:
        action=data.get('action'); version=data.get('version')
        if action not in ('save','issue','revise','void') or set(data)!=({'id','version','action','fields'} if action=='save' else {'id','version','action'}): raise ValueError()
        if type(version) is not int or not 1<=version<2**53: raise ValueError()
        ref=uuid(data['id']); fields=normalize(data['fields']) if action=='save' else None
    except (ValueError,UnicodeError,TypeError): return fail('Invalid quotation data.',400)
    with transaction.atomic():
        role=locked_role(request)
        if not role: return fail('Access denied.',403)
        candidate=scope(request,role).filter(pk=ref).values('lead_id').first()
        if not candidate: return fail('Quotation not found.',404)
        lead=visible_leads(request.user.pk,role).select_for_update().filter(pk=candidate['lead_id']).first()
        if not lead: return fail('Quotation not found.',404)
        if lead.crm_archived_at: return fail('Restore lead before editing.',409)
        q=Quotation.objects.select_for_update().get(pk=ref,lead=lead)
        if q.version!=version: return fail('Quotation changed. Reload before editing.',409)
        if action not in {'draft':('save','issue','void'),'issued':('revise','void'),'void':()}[q.status]: return fail('Invalid quotation transition.',409)
        previous=q.revisions.get(version=q.version).snapshot
        if action=='save':
            fields['recipient']=previous['recipient']; snapshot=fields
        else: snapshot=previous
        if action=='issue' and (date.fromisoformat(snapshot['validUntil'])<timezone.localdate() or snapshot['total']=='0.00'):
            return fail('A quote needs a positive total and a valid expiry date.',400)
        q.status={'save':'draft','issue':'issued','revise':'draft','void':'void'}[action]
        q.version+=1; q.save(update_fields=['status','version','updated_at']); revision(q,snapshot,request.user,action)
        return JsonResponse(detail(q))


@require_GET
@require_role('owner','staff')
def pdf(request, reference, version):
    q=scope(request).filter(pk=reference).first()
    if not q: return fail('Quotation not found.',404)
    r=q.revisions.filter(version=version).first()
    if not r: return fail('Revision not found.',404)
    from .pdf import render
    try: content=render(number(q),r.version,r.status,r.snapshot)
    except UnicodeEncodeError: return fail('PDF currently supports Latin-script text only. Use a Latin-script customer name and description.',422)
    return HttpResponse(content,content_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="{number(q)}-R{r.version}.pdf"'})
