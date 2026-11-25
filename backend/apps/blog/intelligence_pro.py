"""Deterministic public HTML sample analysis; no external I/O or ranking claims."""
from collections import Counter
from hashlib import sha256
from html.parser import HTMLParser
from urllib.parse import urlsplit
import re

VERSION = 2
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
CHROME = {'nav', 'footer', 'aside', 'script', 'style', 'template', 'noscript', 'svg', 'head'}
CHROME_ROLES = {'navigation', 'contentinfo', 'banner', 'complementary', 'dialog', 'alertdialog'}
COOKIE_MARKERS = {'cookie-banner', 'cookie-consent', 'cookie-notice', 'cookie-popup', 'onetrust-banner-sdk'}


def page_kind(path):
    first = path.strip('/').split('/')[0].lower()
    if not first: return 'home'
    groups = {
        'product': {'product','products','platform','features','feature','software','integrations','apps'},
        'solutions': {'solution','solutions','service','services','industries','use-cases','use-case'},
        'pricing': {'pricing','plans','price'},
        'resources': {'blog','blogs','articles','resources','guides','insights','news','learn','docs','help','changelog'},
        'proof': {'customers','customer','case-studies','case-study','stories','portfolio','work'},
        'company': {'about','company','team','careers','contact'},
        'legal': {'privacy','terms','legal','cookies','security','privacy-policy','terms-of-service'},
    }
    return next((k for k, values in groups.items() if first in values), 'other')


def next_sample(paths, attempted):
    """Prefer unrepresented categories, then shallower URLs. Never invent a path."""
    counts = Counter(page_kind(p) for p in attempted)
    priority = {'home':0,'product':1,'solutions':2,'pricing':3,'resources':4,'proof':5,'company':6,'other':7,'legal':8}
    candidates = [(i,p) for i,p in enumerate(paths) if p not in attempted]
    if not candidates: return None
    return min(candidates, key=lambda item: (page_kind(item[1])=='legal', counts[page_kind(item[1])], priority[page_kind(item[1])], len(item[1].strip('/').split('/')), item[0]))[1]


class Bucket:
    def __init__(self):
        self.text=[]; self.size=0; self.capped=False; self.headings=[]; self.blocks=[]; self.links=set()
        self.images=0; self.missing=0; self.empty=0; self.decorative=0; self.nonempty=0
        self.lists=0; self.tables=0; self.ordered=0; self.definitions=0; self.author=0; self.dates=0; self.citations=0
    def add_text(self, value):
        if not value: return
        remaining=20000-self.size
        if len(value)+1>remaining:self.capped=True
        if remaining>1:
            self.text.append(value[:remaining-1]);self.size+=min(len(value)+1,remaining)
    def block(self, tag, value):
        if not value:return
        if len(self.blocks)<500:self.blocks.append((tag,value[:500]))
        if re.fullmatch('h[1-6]',tag) and len(self.headings)<60:
            self.headings.append({'level':int(tag[1]),'text':value[:220]})


class Content(HTMLParser):
    """Prefer main/role=main; fallback excludes identifiable chrome. Not a browser DOM."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.main=Bucket();self.fallback=Bucket();self.stack=[];self.has_main=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);role=(a.get('role') or '').lower(); parent=self.stack[-1] if self.stack else None
        in_main=bool(parent and parent[1]) or tag=='main' or role=='main'
        inherited=bool(parent and parent[2]); decorative=tag=='img' and (role in ('presentation','none') or a.get('aria-hidden')=='true')
        tokens=set(((a.get('id') or '')+' '+(a.get('class') or '')).lower().split())
        excluded=inherited or tag in CHROME or role in CHROME_ROLES or (tag=='header' and not in_main) or bool(tokens & COOKIE_MARKERS) or 'hidden' in a or (a.get('aria-hidden')=='true' and not decorative)
        if in_main and not excluded:self.has_main=True
        b=self.main if in_main else self.fallback
        if not excluded:
            if tag=='img':
                b.images+=1
                if decorative:b.decorative+=1
                elif 'alt' not in a:b.missing+=1
                elif not (a.get('alt') or '').strip():b.empty+=1
                else:b.nonempty+=1
            if tag in ('ul','ol'):b.lists+=1
            if tag=='ol':b.ordered+=1
            if tag=='table':b.tables+=1
            if tag in ('dfn','dl'):b.definitions+=1
            if 'author' in (a.get('rel') or '').lower().split() or 'author' in (a.get('itemprop') or '').lower().split():b.author+=1
            if tag=='time' and a.get('datetime'):b.dates+=1
            if tag=='cite' or (tag in ('q','blockquote') and a.get('cite')):b.citations+=1
            if tag=='a' and a.get('href') and len(b.links)<300:b.links.add(a['href'][:2000])
        capture=[] if not excluded and (tag in ('p','summary','dt','dd') or re.fullmatch('h[1-6]',tag)) else None
        if tag not in VOID:
            if len(self.stack)>=512:raise ValueError('HTML nesting limit')
            self.stack.append((tag,in_main,excluded,capture))
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)
    def handle_endtag(self,tag):
        if tag in VOID:return
        # Close matched frames, including malformed unclosed children. Unmatched tags are ignored.
        index=next((i for i in range(len(self.stack)-1,-1,-1) if self.stack[i][0]==tag),None)
        if index is None:return
        self.finish(index)
    def finish(self,index):
        frames=self.stack[index:];del self.stack[index:]
        for tag,in_main,excluded,capture in reversed(frames):
            if not excluded and capture is not None:
                (self.main if in_main else self.fallback).block(tag,' '.join(capture))
    def handle_data(self,data):
        if self.stack and self.stack[-1][2]:return
        in_main=bool(self.stack and self.stack[-1][1]);b=self.main if in_main else self.fallback
        value=' '.join(data.split())
        b.add_text(value)
        if not value:return
        for _,_,_,capture in reversed(self.stack):
            if capture is not None:
                if len(capture)<100:capture.append(value[:500])
                break
    def close(self):
        super().close();self.finish(0)
    def result(self,host):
        b=self.main if self.has_main else self.fallback
        text=' '.join(b.text);external=set()
        for link in b.links:
            try:
                u=urlsplit(link)
                if u.scheme=='https' and u.hostname and u.hostname!=host:external.add(u.hostname)
            except ValueError:pass
        questions=sum(t.endswith('?') for tag,t in b.blocks if tag=='summary' or re.fullmatch('h[1-6]',tag))
        answers=sum(t.endswith('?') and (tag=='summary' or re.fullmatch('h[1-6]',tag)) and nt in ('p','dd') and len(v.split())>=8 for (tag,t),(nt,v) in zip(b.blocks,b.blocks[1:]))
        return dict(contentScope='main landmark' if self.has_main else 'non-chrome HTML fallback',wordCount=len(text.split()),textSampleCapped=b.capped,
            contentFingerprint=sha256(text.encode()).hexdigest(),headings=b.headings,images=b.images,missingAlt=b.missing+b.empty,missingAltAttribute=b.missing,emptyAlt=b.empty,decorativeImages=b.decorative,nonemptyAlt=b.nonempty,
            contentExternalDomains=len(external),questionCount=questions,answerPairs=answers,lists=b.lists,tables=b.tables,orderedLists=b.ordered,definitions=b.definitions,authorMarkers=b.author,dateMarkers=b.dates,citationMarkers=b.citations)


def recommendations(row):
    """Review candidates, not competitor defects or prescriptions for the owned site."""
    checks=row['checks'];seo=checks['seo'];out=[]
    def add(key,priority,evidence,action):out.append(dict(key=key,priority=priority,evidence=evidence,action=action))
    if row['noindex']:add('noindex','high','Noindex-like directive detected.','Review intended indexing and crawler-specific directives; do not remove intentional exclusions.')
    if not seo['title']:add('title','high','No title detected.','Check rendered HTML and write a descriptive title for indexable pages.')
    if not seo['description']:add('description','medium','No meta description detected.','Review whether a distinct summary would help describe the page.')
    if not seo['oneH1']:add('heading','medium','Sample did not contain exactly one H1.','Review heading hierarchy and the main page topic; multiple H1s are not automatically a ranking penalty.')
    if not seo['canonical']:add('canonical','medium','No canonical declaration detected.','Review preferred URL and duplicate variants; missing canonical alone is not proof of an indexing issue.')
    if row['missingAltAttribute']:add('alt','medium',f"{row['missingAltAttribute']} sampled images lack an alt attribute.",'Review image purpose and add suitable alternatives; decorative images may use empty alt.')
    if row['emptyAlt']:add('empty-alt','review',f"{row['emptyAlt']} sampled images have empty alt without an explicit decorative marker.",'Manually check whether these are decorative; empty alt may be correct.')
    if row['invalidSchema']:add('schema','medium',f"{row['invalidSchema']} JSON-LD blocks failed parsing.",'Inspect invalid JSON-LD; validate schema semantics separately.')
    if not checks['aeo']['answerParagraph']:add('answer','review','No adjacent question and answer paragraph detected.','For suitable informational topics, consider a concise direct answer; not all pages need FAQs.')
    if not checks['geo']['validStructuredData']:add('structured','review','No parseable typed JSON-LD signal detected.','Assess whether relevant structured data describes visible content; no AI visibility guarantee.')
    return out


def historical_delta(current, previous):
    """Only like-version, same-host samples; absence from a sample is not removal."""
    if current.get('analysisVersion')!=VERSION or previous.get('analysisVersion')!=VERSION or current.get('host')!=previous.get('host'):return None
    a={p['path']:p for p in current['pages'] if p.get('measured')};b={p['path']:p for p in previous['pages'] if p.get('measured')}
    if not a or not b:return None
    changes=[]
    for path in sorted(a.keys() & b.keys()):
        x,y=a[path],b[path];fields=[]
        for key in ('title','description','canonical','technology','noindex'):
            if x.get(key)!=y.get(key):fields.append(key)
        if x.get('contentScope')==y.get('contentScope'):
            for key in ('headings','wordCount','contentFingerprint'):
                if x.get(key)!=y.get(key):fields.append(key)
        if fields:changes.append({'path':path,'fields':fields})
    return {'overlap':len(a.keys() & b.keys()),'newlySampled':sorted(a.keys()-b.keys()),'notResampled':sorted(b.keys()-a.keys()),'changes':changes}


# Explicit, curated section labels/heading excerpts from the local public homepage.
# This is an inventory of intended content, not a live DOM scan or published URL inventory.
OWN_SECTIONS = [
    ('studio-web','Web experiences — Make the first interaction count.'),
    ('studio-operations','Business software — Give your work a place to happen.'),
    ('studio-knowledge','AI systems — Answers with context.'),
    ('studio-workflows','Automation — Make routine work repeatable.'),
    ('studio-applications','Applications / Industries — Built around real business needs.'),
    ('studio-questions','Project guidance — Before we build.'),
    ('estimate','Estimate your project.'),
    ('process','How we work.'),
    ('about','About the studio'),
    ('faq','Frequently asked questions'),
]


def own_section_matches(phrase):
    return [{'anchor':anchor,'title':title} for anchor,title in OWN_SECTIONS if phrase in ' '.join(title.casefold().split())]
