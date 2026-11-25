"""Bounded, anonymous HTTPS sample. Never interpret remote HTML as code or instructions."""
import http.client
import ipaddress
import json
import queue
import re
import socket
import ssl
import threading
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from xml.etree import ElementTree as XML
from .competitor_rules import domain
from .intelligence_pro import Content, VERSION, next_sample, page_kind, recommendations

AGENT = 'CedarCompetitorAudit'
MAX_BYTES = 1024 * 1024
MAX_PAGES = 5
MAX_REQUESTS = 10
TOTAL_SECONDS = 22
DNS_SECONDS = 5
REQUEST_SECONDS = 9
_DNS_SLOTS = threading.BoundedSemaphore(2)
PRIVATE = {'admin','administrator','api','auth','account','accounts','login','logout','signin','sign-in','register','signup','sign-up','dashboard','workspace','internal','private','checkout','cart','payment','payments','wp-admin','wp-login','graphql','reset','oauth','session','sessions','settings','billing','download','downloads','delete','unsubscribe','token','callback','sso','user','users'}


def allowed_path(path):
    return (isinstance(path,str) and len(path)<=250 and bool(re.fullmatch(r'/[A-Za-z0-9_~/.-]*',path))
            and '//' not in path and all(p not in ('.','..') and p.lower() not in PRIVATE and not p.startswith('.') and p.lower().split('.')[0] not in PRIVATE for p in path.split('/'))
            and ('.' not in path or path.endswith(('.html','.htm','.xml','.txt'))))


def local_path(value, host, base='/'):
    try:
        if not value or len(value)>2000 or any(ord(c)<33 or ord(c)>126 for c in value) or '\\' in value: return None
        u=urlsplit(urljoin('https://'+host+base,value))
        if u.scheme!='https' or u.netloc.lower()!=host or u.query or not allowed_path(u.path or '/'): return None
        return u.path or '/'
    except ValueError: return None


def public_ip(value):
    ip=ipaddress.ip_address(value)
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local or ip.is_unspecified or getattr(ip,'ipv4_mapped',None) or getattr(ip,'sixtofour',None) or getattr(ip,'teredo',None))


def resolve(host, timeout):
    """DNS is bounded separately; stalled resolver threads cannot accumulate."""
    if not _DNS_SLOTS.acquire(blocking=False): raise OSError('Resolver busy')
    out=queue.Queue(1)
    def worker():
        try: out.put(socket.getaddrinfo(host+'.',443,type=socket.SOCK_STREAM))
        except OSError: out.put(None)
        finally: _DNS_SLOTS.release()
    threading.Thread(target=worker,daemon=True).start()
    try: rows=out.get(timeout=max(.01,min(DNS_SECONDS,timeout)))
    except queue.Empty: raise TimeoutError('DNS timeout') from None
    if not rows: raise OSError('DNS unavailable')
    ips={row[4][0] for row in rows}
    if not all(public_ip(ip) for ip in ips): raise ValueError('Non-public DNS address')
    # IPv4 only avoids NAT64 / IPv6 transition paths. No second DNS lookup.
    choices=sorted(ip for ip in ips if ipaddress.ip_address(ip).version==4)
    if not choices: raise ValueError('No supported public IPv4 address')
    return choices[0]


def fetch(host,path,deadline,*,dns_cache=None):
    start=time.monotonic(); result=dict(status=None,body='',type='',location='',robots='',error='',ms=None)
    if not allowed_path(path): raise ValueError('Unsupported path')
    sock=None; conn=None; response=None; timer=None; stage='DNS'
    try:
        end=min(deadline,start+REQUEST_SECONDS)
        if end<=start: raise TimeoutError()
        # Cache only validated addresses, for this scan and exact hostname.
        # Never persist DNS answers across scans or share between host variants.
        if dns_cache is not None and host in dns_cache:
            ip=dns_cache[host]
            if not public_ip(ip) or ipaddress.ip_address(ip).version!=4:
                raise ValueError('Non-public or unsupported pinned address')
        else:
            ip=resolve(host,end-time.monotonic())
            if dns_cache is not None: dns_cache[host]=ip
        stage='TCP connection'
        remaining=end-time.monotonic()
        if remaining<=0: raise TimeoutError()
        raw=socket.socket(socket.AF_INET,socket.SOCK_STREAM); sock=raw
        raw.settimeout(remaining);raw.connect((ip,443))
        stage='TLS handshake'
        sock=ssl.create_default_context().wrap_socket(raw,server_hostname=host,do_handshake_on_connect=False)
        def interrupt():
            try: sock.shutdown(socket.SHUT_RDWR)
            except OSError: pass
        remaining=end-time.monotonic()
        if remaining<=0: raise TimeoutError()
        sock.settimeout(remaining);timer=threading.Timer(remaining,interrupt);timer.daemon=True;timer.start()
        sock.do_handshake()
        stage='HTTP response'
        conn=http.client.HTTPSConnection(host,443,timeout=remaining);conn.sock=sock
        conn.request('GET',path,headers={'User-Agent':AGENT+'/1.0','Accept':'text/html, text/plain, application/xml, text/xml','Accept-Encoding':'identity','Connection':'close'})
        response=conn.getresponse()
        result.update(status=response.status,type=(response.getheader('Content-Type') or '')[:100],location=(response.getheader('Location') or '')[:500],robots=(response.getheader('X-Robots-Tag') or '')[:300])
        if response.status==200:
            stage='response body'
            if response.getheader('Content-Encoding') not in (None,'','identity'): raise ValueError('Encoded response')
            data=bytearray()
            while True:
                if time.monotonic()>=end: raise TimeoutError()
                chunk=response.read1(min(32768,MAX_BYTES+1-len(data)))
                if not chunk: break
                data.extend(chunk)
                if len(data)>MAX_BYTES: raise ValueError('Response too large')
            if time.monotonic()>=end: raise TimeoutError()
            if response.length not in (None,0):raise ValueError('Incomplete response')
            result['body']=data.decode('utf-8',errors='strict')
    except TimeoutError: result['error']=stage+' timed out.'
    except ssl.SSLCertVerificationError: result['error']='TLS certificate verification failed.'
    except ssl.SSLError: result['error']='TLS handshake or transport failed.'
    except ValueError: result['error']=stage+' rejected by safety or response validation.'
    except (OSError,http.client.HTTPException): result['error']=stage+' failed.'
    finally:
        if timer: timer.cancel()
        if response: response.close()
        if conn: conn.close()
        if sock: sock.close()
        result['ms']=round((time.monotonic()-start)*1000)
    return result


def rule_matches(pattern,path):
    # Linear wildcard matching, no untrusted regular expressions.
    end=pattern.endswith('$'); pattern=pattern[:-1] if end else pattern
    if '*' not in pattern: return path==pattern if end else path.startswith(pattern)
    segments=pattern.split('*'); first=segments[0]; last=segments[-1]
    if not path.startswith(first): return False
    pos=len(first); limit=len(path)
    if end and last:
        if not path.endswith(last): return False
        limit-=len(last)
    else: segments.append('')
    if pos>limit: return False
    for part in segments[1:-1]:
        if not part: continue
        i=path.find(part,pos,limit)
        if i<0: return False
        pos=i+len(part)
    return pos<=limit


class Robots:
    """Conservative subset of REP; unsupported selected rules stop the crawl."""
    def __init__(self,body,agent=AGENT):
        self.sitemaps=[]; groups=[]; agents=[]; rules=[]; delays=[]; started=False
        for raw in body.splitlines():
            key,sep,val=raw.split('#',1)[0].partition(':'); key=key.strip().lower(); val=val.strip()
            if not sep: continue
            if key=='sitemap':
                if len(self.sitemaps)<10:self.sitemaps.append(val)
            elif key=='user-agent':
                if started: groups.append((agents,rules,delays)); agents=[]; rules=[]; delays=[]; started=False
                agents.append(val.lower())
            elif agents and key in ('allow','disallow','crawl-delay','request-rate'):
                started=True
                if key in ('crawl-delay','request-rate'): delays.append((key,val))
                elif val: rules.append((key=='allow',val))
        if agents:groups.append((agents,rules,delays))
        chosen=[g for g in groups if agent.lower() in g[0]] or [g for g in groups if '*' in g[0]]
        self.rules=[]; self.delay=1.0
        for _,rr,dd in chosen:
            for allow,pattern in rr:
                # Normalize percent-encoded unreserved bytes; reject ambiguous selected rules.
                pattern=re.sub(r'%([0-9a-fA-F]{2})',lambda m: chr(int(m[1],16)) if chr(int(m[1],16)) in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~' else m[0],pattern)
                if len(pattern)>500 or not pattern.startswith(('/','*')) or not pattern.isascii() or '%' in pattern or '\\' in pattern or '$' in pattern[:-1]:raise ValueError('Unsupported robots rule')
                self.rules.append((allow,pattern))
                if len(self.rules)>2000:raise ValueError('Too many rules')
            for key,val in dd if agent==AGENT else []:
                if key=='request-rate' or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?',val):raise ValueError('Unsupported crawl rate')
                self.delay=max(self.delay,float(val))
        if self.delay>3:raise ValueError('Requested crawl delay exceeds scan budget')
    def allows(self,path):
        matched=[(len(p.rstrip('$').replace('*','')),a) for a,p in self.rules if rule_matches(p,path)]
        return max(matched)[1] if matched else True


def sitemap(body,host):
    if re.search(r'<!\s*(DOCTYPE|ENTITY)',body,re.I):raise ValueError('Unsupported XML declaration')
    root=XML.fromstring(body); name=root.tag.rsplit('}',1)[-1]
    if name not in ('urlset','sitemapindex'):raise ValueError('Unsupported sitemap')
    paths=[]
    for node in root:
        if node.tag.rsplit('}',1)[-1] != ('url' if name=='urlset' else 'sitemap'):continue
        for loc in node:
            if loc.tag.rsplit('}',1)[-1]=='loc':
                p=local_path((loc.text or '').strip(),host)
                if p and p not in paths:paths.append(p)
                if len(paths)>=500:return name,paths,True
    return name,paths,False


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.title='';self.desc='';self.canonical='';self.robots=[];self.headings=[];self.text=[];self.links=[];self.external=0;self.images=0;self.missing_alt=0;self.tables=0;self.lists=0;self.schema=[];self.tech=set();self.hidden=0;self.capture=None;self.buf='';self.schema_capture=False;self.body=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs); name=(a.get('name') or '').lower(); val=a.get('content') or ''
        if tag=='body':self.body=True
        if tag=='html' and a.get('data-wf-site'):self.tech.add('Webflow HTML signature')
        if tag=='script':
            src=a.get('src') or ''
            if '/_next/' in src:self.tech.add('Next.js asset signature')
            if a.get('id')=='__NEXT_DATA__':self.tech.add('Next.js data signature')
            if '/wp-content/' in src:self.tech.add('WordPress asset signature')
            if '/_nuxt/' in src:self.tech.add('Nuxt asset signature')
            if 'framerusercontent.com/' in src:self.tech.add('Framer asset signature')
            if 'website-files.com/' in src:self.tech.add('Webflow asset signature')
            self.schema_capture=(a.get('type') or '').lower()=='application/ld+json';self.buf='' if self.schema_capture else self.buf
        if tag in ('script','style','template','noscript','svg'):self.hidden+=1
        if tag=='meta':
            if name=='description':self.desc=val[:300]
            if name in ('robots','googlebot','bingbot'):self.robots.append(val[:200])
            if name=='generator' and val:self.tech.add('Generator: '+val[:100])
        if tag=='link' and 'canonical' in (a.get('rel') or '').lower().split():self.canonical=(a.get('href') or '')[:300]
        if tag=='title' or (tag in ('h1','h2','h3','h4','h5','h6') and not self.hidden):self.capture=tag;self.buf=''
        if not self.body or self.hidden:return
        if tag=='a' and a.get('href') and len(self.links)<300:self.links.append(a['href'][:2000])
        if tag=='img':self.images+=1;self.missing_alt+=not bool((a.get('alt') or '').strip())
        if tag=='table':self.tables+=1
        if tag in ('ul','ol'):self.lists+=1
    def handle_endtag(self,tag):
        if tag=='script' and self.schema_capture:
            try:
                data=json.loads(self.buf); types=[]
                def walk(x,depth=0):
                    if depth>12 or len(types)>30:return
                    if isinstance(x,dict):
                        t=x.get('@type');types.extend([t[:80]] if isinstance(t,str) else [i[:80] for i in t[:10] if isinstance(i,str)] if isinstance(t,list) else [])
                        if '@graph' in x:walk(x['@graph'],depth+1)
                    elif isinstance(x,list):
                        for i in x[:30]:walk(i,depth+1)
                walk(data);self.schema.append({'valid':True,'types':types[:30]})
            except (ValueError,RecursionError):self.schema.append({'valid':False,'types':[]})
            self.schema_capture=False;self.buf=''
        if tag in ('script','style','template','noscript','svg'):self.hidden=max(0,self.hidden-1)
        if tag==self.capture:
            v=' '.join(self.buf.split())[:220]
            if tag=='title':self.title=v
            elif v and len(self.headings)<60:self.headings.append({'level':int(tag[1]),'text':v})
            self.capture=None;self.buf=''
        if tag=='body':self.body=False
    def handle_data(self,data):
        if self.schema_capture:self.buf=(self.buf+data)[:MAX_BYTES];return
        if self.hidden:return
        if self.capture:self.buf=(self.buf+data)[:500]
        if self.body and len(self.text)<3000:
            v=' '.join(data.split())[:2000]
            if v:self.text.append(v)


def inspect_page(path,host,res):
    row=dict(path=path,status=res['status'],ms=res['ms'],error=res['error'],measured=False)
    if res['error'] or res['status']!=200 or 'text/html' not in res['type'].lower():return row,[]
    p=Page();content=Content()
    try: p.feed(res['body']);p.close();content.feed(res['body']);content.close()
    except (ValueError,AssertionError,RecursionError):
        row['error']='HTML parse incomplete';return row,[]
    semantic=content.result(host)
    links=[];external=set()
    for link in p.links:
        q=local_path(link,host,path)
        if q and q not in links:links.append(q)
        else:
            try:
                u=urlsplit(link)
                if u.scheme=='https' and u.hostname and u.hostname!=host:external.add(u.hostname)
            except ValueError:pass
    types=sorted({t for s in p.schema for t in s['types']})[:30]
    noindex=bool(re.search(r'\b(noindex|none)\b',' '.join(p.robots+[res['robots']]),re.I))
    row.update(measured=True,title=p.title,description=p.desc,canonical=p.canonical,**semantic,
        pageKind=page_kind(path),internalLinks=len(links),externalDomains=len(external),
        schemaTypes=types,invalidSchema=sum(not s['valid'] for s in p.schema),noindex=noindex,technology=sorted(p.tech)[:15],
        checks={'seo':{'title':bool(p.title),'description':bool(p.desc),'oneH1':sum(h['level']==1 for h in semantic['headings'])==1,'canonical':bool(p.canonical),'noNoindexDirective':not noindex},
        'aeo':{'questionHeading':any(h['text'].endswith('?') for h in semantic['headings']),'structuredListsOrTables':bool(semantic['tables'] or semantic['lists']),'subheadings':any(h['level']>1 for h in semantic['headings']),'answerParagraph':bool(semantic['answerPairs']),'definitionMarkup':bool(semantic['definitions']),'orderedList':bool(semantic['orderedLists'])},
        'geo':{'externalSourceLinks':bool(semantic['contentExternalDomains']),'validStructuredData':bool(types) and all(s['valid'] for s in p.schema),'substantiveText':semantic['wordCount']>=150,'authorMarkup':bool(semantic['authorMarkers']),'datedContent':bool(semantic['dateMarkers']),'citationMarkup':bool(semantic['citationMarkers'])}})
    row['recommendations']=recommendations(row)
    # Do not retain full competitor text or arbitrary remote URLs, only evidence snippets and headings.
    return row,links


def robots_redirect(location, current, allowed_hosts):
    """Only canonical HTTPS /robots.txt on the registered apex/www pair."""
    if not isinstance(location,str) or not location or len(location)>500 or any(ord(c)<33 or ord(c)>126 for c in location) or '\\' in location:
        return None
    try:
        target=urlsplit(urljoin('https://'+current+'/robots.txt',location))
        if target.scheme!='https' or target.netloc.lower() not in allowed_hosts or target.path!='/robots.txt' or target.query or target.fragment or '?' in location or '#' in location:
            return None
        return target.netloc.lower()
    except ValueError:
        return None


def scan(host,variant='apex',fetcher=None,clock=time.monotonic,sleep=time.sleep):
    if variant not in ('apex','www'):raise ValueError('Invalid host variant')
    registered=domain(host); allowed_hosts={registered,'www.'+registered}
    if fetcher is None:
        dns_cache={}
        def fetcher(host,path,deadline):
            return fetch(host,path,deadline,dns_cache=dns_cache)
    host=('www.' if variant=='www' else '')+registered; deadline=clock()+TOTAL_SECONDS; last=None; requests=0; delay=1.; rows=[]; inventory=[]; notes=[]
    report=dict(analysisVersion=VERSION,host=host,measured=0,robots='not measured',sitemap='not measured',pages=rows,discovered=0,requests=0,notes=notes,scope='Stratified bounded public HTML sample; main content or non-chrome fallback',state='incomplete')
    def get(path):
        nonlocal requests,last
        if requests>=MAX_REQUESTS or clock()>=deadline:return None
        if last is not None:
            wait=max(0,delay-(clock()-last))
            if clock()+wait>=deadline:return None
            sleep(wait)
        requests+=1;last=clock();report['requests']=requests
        return fetcher(host,path,deadline)
    r=get('/robots.txt')
    visited={host}
    while r and not r['error'] and r['status'] in (301,302,303,307,308):
        target=robots_redirect(r.get('location',''),host,allowed_hosts)
        if not target or target in visited or len(visited)>=2:
            report['robots']='redirect refused'
            notes.append(f"Robots HTTP {r['status']}: redirect outside the allowed canonical robots path or redirect loop. No pages fetched.")
            return report
        previous=host;host=target;visited.add(host);report['host']=host
        notes.append(f'Canonical robots redirect: {previous} → {host}. Sampling the destination hostname only.')
        r=get('/robots.txt')
    if not r or r['error'] or r['status'] not in (200,404,410):
        status=r['status'] if r else None
        report['robots']=f'HTTP {status}' if status is not None else 'unavailable'
        reason=r['error'] if r and r['error'] else ('HTTP '+str(status) if status is not None else 'Scan budget exhausted')
        notes.append(f'Robots policy unavailable: {reason}. No pages fetched.')
        return report
    try:
        if r['status']==200 and ('text/plain' not in r['type'].lower() or '\ufffd' in r['body']):raise ValueError('Unexpected robots format')
        robot=Robots(r['body'] if r['status']==200 else '');delay=robot.delay
    except ValueError:notes.append('Robots policy or crawl rate unsupported. No pages fetched.');return report
    report['robots']='available' if r['status']==200 else 'not found (404/410)'
    report['crawlerRoot']={}
    for agent in ('Googlebot','bingbot','OAI-SearchBot','GPTBot','Claude-SearchBot','ClaudeBot','PerplexityBot','Google-Extended'):
        try:report['crawlerRoot'][agent]='allowed by parsed root rules' if Robots(r['body'] if r['status']==200 else '',agent).allows('/') else 'disallowed by parsed root rules'
        except ValueError:report['crawlerRoot'][agent]='not evaluated'
    def add(paths):
        for p in paths:
            if p not in inventory and len(inventory)<500 and not p.endswith(('.xml','.txt')):inventory.append(p)
    add(['/'])
    # Measure the homepage before optional discovery, to prioritize actual content.
    if robot.allows('/'):
        root=get('/')
        if root:
            row,links=inspect_page('/',host,root);rows.append(row);add(links)
            if root['status'] in (401,403,429,503):
                notes.append('Homepage access denied, rate limited or unavailable; stopped.');return report
            if root['status'] in (301,302,303,307,308):
                notes.append('Homepage redirects; no redirect followed. Try the other registered hostname variant if appropriate.')
    maps=[p for v in robot.sitemaps if (p:=local_path(v,host)) and p.endswith('.xml')]
    if not maps:maps=['/sitemap.xml']
    seen=set()
    for _ in range(2):
        if not maps:break
        p=maps.pop(0)
        if p in seen or not robot.allows(p):continue
        seen.add(p);r=get(p)
        if not r:break
        if r['status'] in (401,403,429,503):
            report['sitemap']='access denied or rate limited';notes.append('Stopped after sitemap access denial or rate limit.');break
        if r['error'] or r['status']!=200:report['sitemap']='unavailable';continue
        try:
            kind,paths,truncated=sitemap(r['body'],host)
            report['sitemap']='sampled'+(' (capped)' if truncated else '')
            if kind=='sitemapindex':maps.extend(q for q in paths if q.endswith('.xml') and q not in seen)
            else:add(paths)
        except (ValueError,XML.ParseError):report['sitemap']='invalid or unsupported'
    if maps:notes.append('Sitemap discovery limited to two XML documents.')
    attempted={'/'}
    while report['sitemap']!='access denied or rate limited' and len(rows)<MAX_PAGES:
        path=next_sample(inventory,attempted)
        if path is None:break
        attempted.add(path)
        if not robot.allows(path):continue
        r=get(path)
        if not r:break
        if r['status'] in (401,403,429,503):notes.append('Access denied, rate limited or unavailable; stopped.');rows.append(dict(path=path,status=r['status'],ms=r['ms'],error='Scan stopped',measured=False));break
        row,links=inspect_page(path,host,r);rows.append(row);add(links)
    report['sampleKinds']=sorted({p['pageKind'] for p in rows if p.get('measured')});
    report['discovered']=len(inventory); report['measured']=sum(p['measured'] for p in rows)
    report['state']='sampled' if report['measured'] else 'incomplete'
    notes.append('Only a canonical robots redirect between registered host variants is permitted; page redirects are not followed. Public IPv4 HTTPS, ASCII paths, no queries. Results are a partial sample, not rankings or traffic.')
    return report


def published_headings(fields):
    parts=[fields.get('title','')]
    def visit(node):
        if not isinstance(node,dict):return
        children=node.get('content',[])
        if node.get('type')=='heading':
            parts.append(' '.join(c.get('text','') for c in children if isinstance(c,dict)))
        else:
            for c in children:visit(c)
    if 'document' in fields:visit(fields['document'])
    else:parts.extend(s.get('heading','') for s in fields.get('sections',[]))
    return ' '.join(' '.join(parts).casefold().split())
