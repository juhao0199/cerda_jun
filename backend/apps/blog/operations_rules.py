from datetime import date
from .content import text

STAGES=('idea','research','writing','optimizing','ready','archived')
INTENTS=('informational','commercial','transactional','navigational')
PRIORITIES=('low','medium','high')

def ident(value, optional=False):
    if optional and value is None: return None
    if type(value) is not int or not 1 <= value < 2**53: raise ValueError('Invalid identifier.')
    return value

def choice(value, options):
    if not isinstance(value,str) or value not in options: raise ValueError('Invalid selection.')
    return value

def task_fields(data):
    if set(data)!={'title','stage','priority','keyword','audience','intent','brief','outline','due','assigneeId','clusterId'}: raise ValueError('Invalid task fields.')
    due=data['due']
    if due is not None:
        if not isinstance(due,str) or len(due)!=10: raise ValueError('Invalid deadline.')
        due=date.fromisoformat(due)
        if not 2000<=due.year<=2100: raise ValueError('Invalid deadline.')
    return dict(title=text(data['title'],160,1),stage=choice(data['stage'],STAGES),priority=choice(data['priority'],PRIORITIES),keyword=text(data['keyword'],100),audience=text(data['audience'],160),intent=choice(data['intent'],INTENTS),brief=text(data['brief'],4000),outline=text(data['outline'],4000),due=due,assignee_id=ident(data['assigneeId'],True),cluster_id=ident(data['clusterId'],True))

def cluster_fields(data):
    if set(data)!={'name','keyword','market','intent','keywords','notes','archived'} or type(data['archived']) is not bool: raise ValueError('Invalid cluster fields.')
    words=data['keywords']
    if not isinstance(words,list) or len(words)>30: raise ValueError('Use up to 30 supporting keywords.')
    words=[text(w,100,1) for w in words]
    if len({w.casefold() for w in words})!=len(words): raise ValueError('Supporting keywords must be unique.')
    return dict(name=text(data['name'],120,1),keyword=text(data['keyword'],100,1),market=text(data['market'],100),intent=choice(data['intent'],INTENTS),keywords=words,notes=text(data['notes'],4000),archived=data['archived'])

def health(rows, today):
    # Input is the published snapshot, never the editable draft.
    counts={}
    for r in rows:
        for key in ('title','description','keyword'):
            v=' '.join(r[key].casefold().split())
            if v: counts[(key,v)]=counts.get((key,v),0)+1
    result=[]
    for r in rows:
        findings=[]
        for key in ('title','description','keyword'):
            v=' '.join(r[key].casefold().split())
            if v and counts[(key,v)]>1: findings.append('Duplicate '+key+' in sampled content')
        if not r['description']: findings.append('Review missing description')
        if r['modified'] and (today-r['modified']).days>=180: findings.append('Review content not updated in 180 days')
        if findings: result.append({'path':r['path'],'title':r['title'],'findings':findings})
    return result
