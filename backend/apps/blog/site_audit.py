"""Bounded anonymous HTTP audit of a deployment-configured origin only.
No request URL is supplied by a user; redirects are inspected, never followed.
Only public route patterns are fetched; external links are not requested.
"""
import http.client
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin
from xml.etree import ElementTree

PAGE_SIZE = 12
LINK_LIMIT = 8
MAX_BYTES = 2 * 1024 * 1024
PUBLIC = re.compile(r'/(?:blog(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?|privacy)?\Z')


def public_path(path):
    return isinstance(path, str) and len(path) <= 106 and bool(PUBLIC.fullmatch(path))


def origin(value):
    p = urlsplit(value)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password or p.path not in ('', '/') or p.query or p.fragment:
        raise ValueError('Invalid audit origin configuration.')
    _ = p.port
    return p


def local_path(value, base, site):
    try:
        if not value or len(value) > 2048 or '\\' in value or any(ord(c) < 32 for c in value): return None
        u = urlsplit(urljoin(base, value))
        if (u.scheme, u.netloc) != (site.scheme, site.netloc) or u.query or not public_path(u.path): return None
        return u.path
    except ValueError:
        return None


def empty_response(error=''):
    return {'status': None, 'ms': None, 'error': error, 'location': '', 'type': '', 'robots': '', 'body': ''}


def safe_location(value):
    # Do not retain redirect query strings, credentials or fragments in reports.
    try:
        p = urlsplit(value or '')
        if p.username or p.password: return '[redacted redirect]'
        return p._replace(query='',fragment='').geturl()[:300]
    except ValueError: return '[invalid redirect]'


def fetch(target, site, path):
    if not public_path(path) and path not in ('/robots.txt', '/sitemap.xml'):
        raise ValueError('Unsupported public path.')
    start = time.monotonic()
    conn = (http.client.HTTPSConnection if target.scheme == 'https' else http.client.HTTPConnection)(target.hostname, target.port, timeout=2.5)
    result = empty_response()
    try:
        conn.request('GET', path, headers={'Host': site.netloc, 'User-Agent': 'CedarSiteAudit/1.0', 'Accept': '*/*', 'Accept-Encoding': 'identity', 'Connection': 'close'})
        response = conn.getresponse()
        result.update(status=response.status, location=safe_location(response.getheader('Location')), type=(response.getheader('Content-Type') or '')[:100], robots=(response.getheader('X-Robots-Tag') or '')[:300])
        if response.status == 200:
            if response.getheader('Content-Encoding') not in (None, '', 'identity'):
                raise ValueError('Unsupported response encoding.')
            data = bytearray()
            while True:
                if time.monotonic()-start > 4: raise TimeoutError()
                chunk = response.read1(min(65536, MAX_BYTES+1-len(data)))
                if not chunk: break
                data.extend(chunk)
                if len(data)>MAX_BYTES: raise ValueError('Response exceeded 2 MiB.')
            result['body'] = data.decode('utf-8', errors='replace')
    except (OSError, http.client.HTTPException, ValueError):
        result['error'] = 'Request failed, timed out, or exceeded response limits.'
    finally:
        conn.close()
        result['ms'] = round((time.monotonic()-start)*1000)
    return result


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''; self.description = ''; self.canonicals = []; self.robots = []
        self.h1 = 0; self.images = 0; self.missing_alt = 0; self.links = set(); self.schemas = []
        self.in_title = False; self.in_schema = False; self.schema = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title': self.in_title = True
        elif tag == 'meta':
            name = (a.get('name') or '').lower()
            if name == 'description': self.description = (a.get('content') or '')[:500]
            elif name in ('robots', 'googlebot', 'bingbot'): self.robots.append((a.get('content') or '')[:300])
        elif tag == 'link' and 'canonical' in (a.get('rel') or '').lower().split(): self.canonicals.append((a.get('href') or '')[:500])
        elif tag == 'h1': self.h1 += 1
        elif tag == 'img':
            self.images += 1
            if 'alt' not in a or a['alt'] is None: self.missing_alt += 1
        elif tag == 'a' and a.get('href') and len(self.links)<500: self.links.add(a['href'])
        elif tag == 'script' and (a.get('type') or '').lower() == 'application/ld+json': self.in_schema = True; self.schema = ''

    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'script' and self.in_schema:
            self.schemas.append(self.schema); self.in_schema = False

    def handle_data(self, data):
        if self.in_title: self.title = (self.title+data)[:500]
        if self.in_schema: self.schema += data


def sitemap_paths(body, site):
    if re.search(r'<!\s*(DOCTYPE|ENTITY)', body, re.I): raise ValueError('Unsupported XML declaration.')
    try: root = ElementTree.fromstring(body)
    except ElementTree.ParseError as exc: raise ValueError('Invalid sitemap XML.') from exc
    ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    if root.tag != ns+'urlset': raise ValueError('Expected a sitemap URL set.')
    paths = set(); invalid = 0; duplicates = 0
    for node in root.findall(ns+'url'):
        value = (node.findtext(ns+'loc') or '').strip()
        try: u = urlsplit(value); p = local_path(value, site.geturl()+'/', site) if u.scheme and u.netloc and not u.fragment else None
        except ValueError: p = None
        if p is None: invalid += 1
        elif p in paths: duplicates += 1
        else: paths.add(p)
    return paths, invalid, duplicates


def normalized_robots(body):
    return [line.split('#',1)[0].strip() for line in body.splitlines() if line.split('#',1)[0].strip()]


def audit_page(path, response, site, sitemap):
    row = {k: response[k] for k in ('status','ms','error','location')}
    row.update(path=path, issues=[], title='', description='', canonical='', noindex=None, h1=None, images=None, missingAlt=None, schemas=None, invalidSchemas=None)
    issues = row['issues']; links = set()
    if response['error']: issues.append('Fetch incomplete'); return row, links
    if response['status'] != 200: issues.append('Redirect' if response['status'] in (301,302,303,307,308) else 'Non-200 HTTP response'); return row, links
    if 'text/html' not in response['type'].lower(): issues.append('Expected HTML'); return row, links
    doc = Document()
    try: doc.feed(response['body']); doc.close()
    except (ValueError, RecursionError, AssertionError): issues.append('HTML parse incomplete'); return row, links
    base = site.geturl().rstrip('/')+path
    invalid = 0
    for raw in doc.schemas:
        try:
            if not isinstance(json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError())), (dict,list)): invalid += 1
        except (ValueError, RecursionError): invalid += 1
    noindex = bool(re.search(r'\b(?:noindex|none)\b', ','.join(doc.robots+[response['robots']]), re.I))
    row.update(title=doc.title.strip(), description=doc.description.strip(), canonical=doc.canonicals[0] if doc.canonicals else '', noindex=noindex, h1=doc.h1, images=doc.images, missingAlt=doc.missing_alt, schemas=len(doc.schemas), invalidSchemas=invalid)
    if not row['title']: issues.append('Missing title')
    if not row['description']: issues.append('Missing meta description')
    if len(doc.canonicals)!=1 or doc.canonicals[0]!=base: issues.append('Missing, duplicate or non-self canonical')
    if doc.h1!=1: issues.append('Expected one H1 (editorial heuristic)')
    if doc.missing_alt: issues.append('Images missing alt attributes')
    if invalid: issues.append('Invalid JSON-LD syntax or top-level type')
    if sitemap is not None:
        if noindex and path in sitemap: issues.append('Noindex URL listed in sitemap')
        if not noindex and path not in sitemap: issues.append('Indexable URL absent from sitemap')
    links = {p for href in doc.links if (p:=local_path(href,base,site)) is not None}
    return row, links


def run_audit(target_value, site_value, expected_robots, inventory, offset=0, fetcher=fetch):
    target, site = origin(target_value), origin(site_value)
    inventory = sorted(set(p for p in inventory if public_path(p)))
    deadline = time.monotonic() + 17
    def check(path):
        if time.monotonic() >= deadline: return empty_response('Audit time budget exhausted; retry this batch.')
        return fetcher(target,site,path)
    def collect(paths):
        with ThreadPoolExecutor(max_workers=4) as pool:
            return dict(zip(paths, pool.map(check, paths)))
    first = collect(['/robots.txt','/sitemap.xml'])
    robots, sitemap = first['/robots.txt'], first['/sitemap.xml']
    paths = None; invalid = duplicates = None
    if sitemap['status']==200 and not sitemap['error']:
        try: paths,invalid,duplicates = sitemap_paths(sitemap['body'],site)
        except ValueError: pass
    candidates = sorted(set(inventory) | (paths or set()), key=lambda p: (p not in ('/','/blog','/privacy'),p))
    selected = candidates[offset:offset+PAGE_SIZE]
    responses = collect(selected)
    rows, discovered = [], set()
    for path in selected:
        row, links = audit_page(path,responses[path],site,paths); rows.append(row); discovered.update(links)
    extra = sorted(discovered-set(responses))[:LINK_LIMIT]
    responses.update(collect(extra))
    link_rows = [{'path':p, 'status':responses[p]['status'], 'error':responses[p]['error'], 'location':responses[p]['location']} for p in sorted(discovered & set(responses))]
    return {'site':site.geturl().rstrip('/'), 'scope':'origin HTTP (no browser or edge guarantee)', 'offset':offset,'totalPages':len(candidates),'nextOffset':offset+PAGE_SIZE if offset+PAGE_SIZE<len(candidates) else None,
            'pages':rows,'links':link_rows,'linksDiscovered':len(discovered),'linksChecked':len(link_rows),
            'robots':{'status':robots['status'],'error':robots['error'],'matchesPolicy':normalized_robots(robots['body'])==normalized_robots(expected_robots) if robots['status']==200 and not robots['error'] else None},
            'sitemap':{'status':sitemap['status'],'error':sitemap['error'],'valid':paths is not None,'urls':len(paths) if paths is not None else None,'invalidUrls':invalid,'duplicates':duplicates}}
