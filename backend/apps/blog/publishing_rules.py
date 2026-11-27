from datetime import datetime, timedelta, timezone

ACTIVE = ('review', 'returned', 'approved', 'scheduled', 'stale')
TRANSITIONS = {
    'review': {'approve', 'return', 'cancel'},
    'returned': {'resubmit', 'cancel'},
    'approved': {'schedule', 'publish', 'return', 'cancel'},
    'scheduled': {'schedule', 'publish', 'return', 'cancel'},
    'stale': {'resubmit', 'cancel'},
}
OWNER_ACTIONS = {'approve', 'return', 'schedule', 'publish'}


def schedule_time(value, now):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('Supply an ISO datetime with timezone.')
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('Supply an ISO datetime with timezone.') from None
    if date.tzinfo is None or date.utcoffset() is None:
        raise ValueError('Timezone is required.')
    date = date.astimezone(timezone.utc)
    if not now < date <= now + timedelta(days=365):
        raise ValueError('Choose a future time within 365 days.')
    return date
