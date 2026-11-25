"""Pure validation for human-observed search measurements. No network access."""
from datetime import datetime, timedelta, timezone
import hashlib
import re
import unicodedata
from urllib.parse import urlsplit

ENGINES = ('ChatGPT Search', 'Google AI Overviews', 'Gemini', 'Perplexity', 'Microsoft Copilot', 'Claude Search')
INTENTS = ('commercial', 'informational', 'comparison', 'branded')
OUTCOMES = ('present', 'absent', 'inconclusive')
OWNED = {'cedarandcursor.com', 'www.cedarandcursor.com'}


def prompt_key(question, language, market, engines):
    normalized = [' '.join(unicodedata.normalize('NFKC', v).casefold().split()) for v in (question, language, market)]
    return hashlib.sha256(('\0'.join(normalized + sorted(engines))).encode()).hexdigest()


def sources(value, citation):
    """Store reported source URLs only; never fetch or claim independent verification."""
    if not isinstance(value, str): raise ValueError('Invalid sources.')
    lines = [x.strip() for x in value.splitlines() if x.strip()]
    if len(lines) > 8 or len(lines) != len(set(lines)): raise ValueError('Use at most eight distinct source URLs.')
    result = []
    for url in lines:
        if len(url) > 400 or not url.isascii() or any(ord(c) <= 32 or ord(c) == 127 for c in url) or '\\' in url:
            raise ValueError('Invalid source URL.')
        try:
            p = urlsplit(url)
            host = p.hostname or ''
            if p.scheme != 'https' or p.username is not None or p.password is not None or p.port not in (None,443) or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',host) or '.' not in host:
                raise ValueError('Use HTTPS source URLs without credentials.')
        except ValueError: raise ValueError('Use HTTPS source URLs without credentials.') from None
        result.append({'url':url, 'owned':host in OWNED})
    has_owned = any(r['owned'] for r in result)
    if citation == 'present' and not has_owned: raise ValueError('A reported site citation requires a cedarandcursor.com source URL.')
    if citation == 'absent' and has_owned: raise ValueError('A site source conflicts with an absent citation.')
    return result


def observed_time(value, now):
    try:
        dt = datetime.fromisoformat(value.replace('Z','+00:00'))
        if dt.utcoffset() is None or dt > now + timedelta(minutes=5) or dt < now - timedelta(days=3650): raise ValueError
        return dt.astimezone(timezone.utc)
    except (ValueError, OverflowError, AttributeError): raise ValueError('Use a valid observation time with timezone, not in the future.') from None
