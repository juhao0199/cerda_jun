"""Owner-only assignment; no implicit self-assignment or privilege escalation."""
from uuid import UUID
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse
from apps.accounts.models import AccountSecurity, SecurityEvent
from apps.accounts.security import fingerprint
from apps.accounts.team import positive_id
from apps.accounts.views import fail, json_post, require_role
from .crm import lead_row
from .models import Inquiry, LeadActivity


@json_post
@require_role('owner')
def assign(request, data):
    if set(data) != {'reference', 'version', 'assigneeId'} or type(data['version']) is not int or not 1 <= data['version'] < 2**53:
        return fail('Invalid assignment.', 400)
    try:
        reference = UUID(data['reference']) if isinstance(data['reference'], str) else None
        target_id = positive_id(data['assigneeId']) if data['assigneeId'] is not None else None
    except ValueError:
        return fail('Invalid assignment.', 400)
    if reference is None:
        return fail('Invalid assignment.', 400)
    actor_id = request.user.pk
    ids = {actor_id} if target_id is None else {actor_id, target_id}
    with transaction.atomic():
        # Same lock order as team administration: users, profiles, then business row.
        users = {u.pk: u for u in get_user_model().objects.select_for_update().filter(pk__in=ids).order_by('pk')}
        profiles = {p.user_id: p for p in AccountSecurity.objects.select_for_update().filter(user_id__in=users).order_by('user_id')}
        actor, ap = users.get(actor_id), profiles.get(actor_id)
        if not actor or not actor.is_active or not ap or ap.role != 'owner' or ap.version != request.session.get('cedar_version'):
            return fail('Access denied.', 403)
        target = users.get(target_id)
        tp = profiles.get(target_id)
        if target_id is not None and (not target or not target.is_active or not tp or tp.role != 'staff'):
            return fail('Select an active staff account.', 400)
        row = Inquiry.objects.select_for_update().filter(pk=reference).first()
        if row is None:
            return fail('Lead not found.', 404)
        if row.crm_archived_at:
            return fail('Restore this lead before editing.', 409)
        if row.crm_version != data['version']:
            return fail('Lead changed. Reload before editing.', 409)
        old_id = row.assigned_to_id
        if old_id == target_id:
            return JsonResponse(lead_row(row))
        row.assigned_to = target
        row.crm_version += 1
        row.save(update_fields=['assigned_to', 'crm_version'])
        LeadActivity.objects.create(inquiry=row, actor_id=actor_id, action='assignment.changed',
            message=f'Account {old_id or "unassigned"} → {target_id or "unassigned"}')
        SecurityEvent.objects.create(action='crm.assignment.changed', actor_id=actor_id,
            target_id=target_id if target_id is not None else old_id, subject=fingerprint(str(row.reference)))
        return JsonResponse(lead_row(row))
