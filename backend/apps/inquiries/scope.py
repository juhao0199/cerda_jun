"""Record-level policy shared by every CRM and legacy read entrypoint."""
from .models import Inquiry, Client


def visible_leads(user_id, role):
    if role == 'owner':
        return Inquiry.objects.all()
    if role == 'staff':
        return Inquiry.objects.filter(assigned_to_id=user_id, crm_archived_at__isnull=True)
    return Inquiry.objects.none()


def visible_clients(user_id, role):
    if role == 'owner':
        return Client.objects.all()
    if role == 'staff':
        return Client.objects.filter(pk__in=visible_leads(user_id, role).exclude(client_id=None).values('client_id'))
    return Client.objects.none()
