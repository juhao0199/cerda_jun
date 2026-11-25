"""Pure, non-network rules. Sources are reported samples, not a complete citation set."""
import ipaddress
import re
from urllib.parse import urlsplit


def domain(value):
    if not isinstance(value, str):
        raise ValueError('Enter a website hostname.')
    host = value.strip().lower().removeprefix('www.')
    if len(host)>253 or '.' not in host or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', part) for part in host.split('.')):
        raise ValueError('Enter a hostname only, without scheme, port or path.')
    if not host.split('.')[-1].isalpha() and not host.split('.')[-1].startswith('xn--'):
        raise ValueError('Enter a public domain name.')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('IP addresses are not supported.')
    if host == 'cedarandcursor.com' or host.endswith('.cedarandcursor.com') or host.endswith(('.localhost','.local','.test','.invalid','.example')):
        raise ValueError('Enter a competitor domain, not an owned or reserved domain.')
    return host


def matched_sources(host, sources):
    matched = []
    for item in sources:
        if not isinstance(item, dict) or not isinstance(item.get('url'), str):
            continue
        url = item['url']
        try:
            p = urlsplit(url)
            h = p.hostname or ''
            if p.scheme == 'https' and p.username is None and p.password is None and p.port in (None,443) and (h == host or h == 'www.'+host):
                if url not in matched:
                    matched.append(url)
        except ValueError:
            continue
    return matched


def pair_stats(rows):
    result = dict(paired=0, comparable=0, ownMentions=0, competitorMentions=0, ownOnly=0, competitorOnly=0, both=0, neither=0, competitorSources=0, citationGapSignals=0)
    for own, other, own_citation, sources in rows:
        result['paired'] += 1
        if sources:
            result['competitorSources'] += 1
            if own_citation == 'absent':
                result['citationGapSignals'] += 1
        if own not in ('present','absent') or other not in ('present','absent'):
            continue
        result['comparable'] += 1
        result['ownMentions'] += own=='present'
        result['competitorMentions'] += other=='present'
        result['both' if own==other=='present' else 'neither' if own==other=='absent' else 'ownOnly' if own=='present' else 'competitorOnly'] += 1
    mentions = result['ownMentions'] + result['competitorMentions']
    result['ownShare'] = round(100 * result['ownMentions']/mentions, 1) if mentions else None
    return result


def visible_text(fields):
    """Only published visible article text; no draft, metadata or link attributes."""
    parts = [fields.get('title',''), fields.get('summary','')]
    if 'document' in fields:
        def walk(node):
            if not isinstance(node,dict): return
            if isinstance(node.get('text'),str): parts.append(node['text'])
            if isinstance(node.get('content'),list):
                for child in node['content']: walk(child)
        walk(fields['document'])
    else:
        for section in fields.get('sections',[]):
            parts.extend([section.get('heading',''),section.get('body','')])
    return ' '.join(' '.join(parts).casefold().split())
