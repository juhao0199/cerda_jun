from django.db.models import Q

SOURCES = ('website', 'linkedin', 'email', 'whatsapp', 'referral', 'other')
PRIORITIES = ('low', 'normal', 'high', 'urgent')
CURRENCIES = ('USD', 'THB', 'SGD', 'EUR', 'GBP', 'AUD', 'NZD', 'AED')


def contact(row):
    return row.crm_contact or {'name': row.payload.get('name', ''), 'company': row.payload.get('company', ''),
                               'email': row.email, 'overview': row.payload.get('overview', '')}


def contact_email(email):
    return Q(crm_contact__email__iexact=email) | Q(crm_contact={}, email__iexact=email)


def search_contact(query):
    return (Q(crm_contact__email__icontains=query) | Q(crm_contact__name__icontains=query) |
            Q(crm_contact__company__icontains=query) | (Q(crm_contact={}) &
            (Q(email__icontains=query) | Q(payload__name__icontains=query) | Q(payload__company__icontains=query))))
