'use client';
import {useState} from 'react';
import type {ReactNode} from 'react';
import s from './expansion.module.css';
import {usePreviewMotion,type PreviewMotion} from './expansion-motion';
import {useLayoutMotion} from './expansion-layout-motion';
import {FieldTable,type FieldPage,type FieldCategory,type FieldParty,type FieldDay,type FieldTime} from './field-table';
import field from './field-table.module.css';

type IconName='grid'|'list'|'search'|'arrow'|'check'|'globe'|'code'|'spark'|'lock'|'branch'|'file'|'monitor'|'phone'|'plus'|'refresh';
const paths:Record<IconName,ReactNode>={grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,list:<><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/></>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,arrow:<path d="M4 12h15m-6-6 6 6-6 6"/>,check:<path d="m5 12 4 4 10-10"/>,globe:<><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,code:<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>,spark:<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z"/>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,branch:<><path d="M6 4v12a4 4 0 0 0 4 4h8M6 8h8a4 4 0 0 0 4-4"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="18" cy="20" r="2"/></>,file:<><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></>,monitor:<><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10"/></>,phone:<><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>,plus:<path d="M12 4v16M4 12h16"/>,refresh:<><path d="M20 10a8 8 0 1 0-1 7M20 3v7h-7"/></>};
export function Glyph({name}:{name:IconName}){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>}
function Frame({title,children,action,motion,tone}:{title:string;children:ReactNode;action?:ReactNode;motion:PreviewMotion;tone:"web"|"software"|"ai"|"automation"}){
  return <div ref={motion.ref} className={s.frame} data-cedar-reveal="surface" data-cedar-spotlight="stage" data-studio-tone={tone} data-motion-running={motion.running}>
    <div className={s.showcaseToolbar}><span className={s.windowTitle}>{title}</span>
    <div className={s.motionStrip}>
      <span className={s.motionStatus}><i aria-hidden="true"/>{motion.reduced?'Reduced motion':motion.enabled?'Auto preview':'Manual preview'}</span>
      <div className={s.motionTrack} aria-hidden="true"><span/></div>
      <button type="button" className={s.motionButton} aria-label={`${motion.reduced?'Disabled':motion.enabled?'Pause':'Play'} ${title} auto preview`} disabled={motion.reduced} onClick={motion.toggle}>{motion.enabled?<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2"/></svg>:<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 8 5-8 5Z" fill="currentColor"/></svg>}{motion.reduced?'Off':motion.enabled?'Pause':'Play'}</button>
    </div>
    {action&&<div className={s.showcaseActions} onPointerDownCapture={motion.pause} onFocusCapture={motion.pause} onClickCapture={motion.pause}>{action}</div>}</div>
    <div onPointerDownCapture={motion.pause} onFocusCapture={motion.pause} onClickCapture={motion.pause}>{children}</div>
  </div>
}
const seed=[
 {name:'Website refresh',team:'Design',stage:'Discovery'},
 {name:'Inventory dashboard',team:'Engineering',stage:'In progress'},
 {name:'Customer portal',team:'Engineering',stage:'Review'},
 {name:'Knowledge assistant',team:'AI systems',stage:'Discovery'},
 {name:'Digital menu',team:'Design',stage:'In progress'},
 {name:'API integration',team:'Engineering',stage:'Review'},
 {name:'Approval workflow',team:'Engineering',stage:'Discovery'},
 {name:'Access policy',team:'AI systems',stage:'Complete'},
];
const stages=['Discovery','In progress','Review','Complete'];
export function OperationsDemo(){
  const [rows,setRows]=useState(seed);
  const [view,setView]=useState<'board'|'list'>('board');
  const [filter,setFilter]=useState('');
  const [activity,setActivity]=useState('Ready to explore');
  const motion=usePreviewMotion(step=>{
    const stage=['In progress','Review','Complete','Discovery'][step%4];
    setRows(old=>old.map(r=>r.name==='Website refresh'?{...r,stage}:r));
    setActivity(`Website refresh · ${stage}`);
  },3400);
  const visible=rows.filter(r=>`${r.name} ${r.team}`.toLowerCase().includes(filter.toLowerCase()));
  const boardRef=useLayoutMotion(JSON.stringify([view,visible.map(r=>[r.name,r.stage])]),motion.reduced,motion.inView);
  const laneRows=Math.max(4,...stages.map(stage=>visible.filter(r=>r.stage===stage).length));
  function move(name:string,stage:string){setRows(old=>old.map(r=>r.name===name?{...r,stage}:r));setActivity(`${name} · ${stage}`)}
  return <Frame tone="software" title="Operations / Projects" motion={motion} action={<button type="button" className={s.iconButton} aria-label="Reset project demo" onClick={()=>{setRows(seed);setFilter('');setView('board');setActivity('Ready to explore')}}><Glyph name="refresh"/></button>}>
    <div className={s.app}>
      <aside className={s.rail}><div className={s.railBrand}><span>C</span> Workspace</div><div className={s.railLabel}>Operations</div><div className={s.railActive}><Glyph name="grid"/> Projects</div><div><Glyph name="file"/> Briefs</div><div><Glyph name="branch"/> Workflows</div><div><Glyph name="lock"/> Access</div><small>Illustrative workspace</small></aside>
      <div className={s.appMain}>
        <div className={s.appHeading}><div><small>Workspace / Operations</small><h4>Projects</h4></div><span className={s.count}>{rows.filter(r=>r.stage==='Complete').length} complete / {rows.length}</span></div>
        <div className={s.tools}><div className={s.switch}><button type="button" aria-pressed={view==='board'} onClick={()=>setView('board')}><Glyph name="grid"/> Board</button><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}><Glyph name="list"/> List</button></div><label className={s.search}><Glyph name="search"/><input aria-label="Search demo projects" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter projects"/></label></div>
        {view==='board'?<div className={s.boardViewport}><div className={s.motionBoard} ref={boardRef} style={{gridTemplateRows:`37px repeat(${laneRows},90px)`}}>
          {stages.map((stage,i)=><div key={stage} className={s.boardLane} data-lane={i} style={{gridColumn:i+1,gridRow:`1/${laneRows+2}`}}><div className={s.columnHead}><span className={s.statusDot} data-stage={i}/>{stage}<small>{visible.filter(r=>r.stage===stage).length}</small></div></div>)}
          {visible.map(r=>{const column=stages.indexOf(r.stage)+1;const row=visible.filter(x=>x.stage===r.stage).indexOf(r)+2;return <div className={s.motionTicket} data-team={r.team} data-stage={column-1} data-layout-key={r.name} key={r.name} style={{gridColumn:column,gridRow:row}}><div className={s.ticketTop}><span className={s.ticketIcon}><Glyph name={r.team==='AI systems'?'spark':r.team==='Design'?'globe':'code'}/></span><small>{r.team}</small></div><strong>{r.name}</strong><label><span>Stage</span><select aria-label={`Move ${r.name}`} value={r.stage} onChange={e=>move(r.name,e.target.value)}>{stages.map(x=><option key={x}>{x}</option>)}</select></label></div>})}
        </div></div>:<div className={s.tableScroll}><table className={s.table}><thead><tr><th>Project</th><th>Team</th><th>Stage</th></tr></thead><tbody>{visible.map(r=><tr key={r.name}><td>{r.name}</td><td>{r.team}</td><td><select aria-label={`Move ${r.name}`} value={r.stage} onChange={e=>move(r.name,e.target.value)}>{stages.map(x=><option key={x}>{x}</option>)}</select></td></tr>)}</tbody></table></div>}
        {!visible.length&&<p className={s.empty}>No matching projects.</p>}
        <div className={s.activity}><span className={s.activityIcon}><Glyph name="check"/></span><div><small>ACTIVITY / SAMPLE</small><strong key={activity}>{activity}</strong></div><span className={s.activityLine} aria-hidden="true"/></div>
        <div className={s.appFoot}>Sample data · Changes stay in this browser session.</div>
      </div>
    </div>
  </Frame>
}
const questions=[{q:'How do I request system access?',a:'Send a request identifying the system, your role and the reason for access. The system owner reviews the request before access is granted.',source:'Access policy',excerpt:'Access requires a documented business need and approval from the system owner.'},{q:'What happens before a release?',a:'Review the agreed acceptance criteria, run the release checks and obtain approval. Prepare a rollback plan before deployment.',source:'Release checklist',excerpt:'Acceptance checks, approval and a rollback plan are required before deployment.'},{q:'Can the assistant approve a payment?',a:'No. It can help prepare information, but a person with the required authority must approve a payment.',source:'Approval policy',excerpt:'Financial approvals must remain with authorized human reviewers.'}];
export function KnowledgeDemo(){
  const [selected,setSelected]=useState<number|null>(null);
  const [phase,setPhase]=useState(0);
  const [showSource,setShowSource]=useState(false);
  const motion=usePreviewMotion(step=>{
    const phase=step%4;
    setSelected(Math.floor(step/4)%questions.length);
    setPhase(phase===0?1:2);
    setShowSource(phase>=2);
  },2100);
  const q=selected===null?null:questions[selected];
  return <Frame tone="ai" title="Knowledge / Assistant" motion={motion}>
    <div className={s.knowledge}>
      <div className={s.knowledgeTop}><span className={s.aiMark}><Glyph name="spark"/></span><div><h4>Ask your business.</h4><p>Find answers in an approved knowledge base.</p></div></div>
      <div className={s.questions}>{questions.map((item,i)=><button type="button" key={item.q} aria-pressed={selected===i} onClick={()=>{setSelected(i);setPhase(2);setShowSource(false)}}>{item.q}<Glyph name="arrow"/></button>)}</div>
      <div className={s.response} aria-live={motion.running?'off':'polite'}>
        <div className={s.responseLabel}><Glyph name="spark"/> Illustrative answer</div>
        <div className={s.retrieval} data-phase={phase} aria-hidden="true"><span/><span/><span/></div>
        <div className={s.retrievalSteps}><span data-active={phase>=1}>01 · Retrieve</span><span data-active={phase>=2}>02 · Respond</span><span data-active={showSource}>03 · Verify</span></div>
        {q?<div className={s.answerStage}>
          {phase===1?<div className={s.retrieving}><span className={s.documentMark}><Glyph name="file"/></span><div><strong>{q.source}</strong><small>Retrieving prepared example…</small></div></div>:<><p key={q.q} className={s.answerText}>{q.a}</p><button type="button" className={s.source} aria-expanded={showSource} onClick={()=>setShowSource(v=>!v)}><Glyph name="file"/>{q.source}<span>{showSource?'−':'+'}</span></button><div className={s.sourceReveal} data-open={showSource} inert={!showSource}><div><p className={s.excerpt}>{q.excerpt}</p></div></div></>}
        </div>:<p className={s.empty}>Choose a question to see an example answer and its source.</p>}
      </div>
      <div className={s.appFoot}>Prepared examples · No live model or private documents.</div>
    </div>
  </Frame>
}
const flow=[['Capture request','Form or approved API'],['Validate fields','Check required information'],['Route to owner','Use an agreed business rule'],['Human review','Confirm before external action'],['Record outcome','Keep an auditable result']];
export function WorkflowDemo(){const [index,setIndex]=useState(-1);const [approved,setApproved]=useState(false);const motion=usePreviewMotion(step=>{setApproved(false);setIndex(Math.min(step%6,3))},2400);return <Frame tone="automation" title="Automation / Request routing" motion={motion}><div className={s.workflow}><div className={s.flowControls}><span>Request routing</span><button type="button" className={s.smallButton} onClick={()=>{setIndex(-1);setApproved(false)}}>Reset</button></div><div className={s.flowList} data-step={index}><div className={s.flowSpine} aria-hidden="true"><span style={{transform:`scaleY(${Math.max(0,index)/4})`}}/></div>{flow.map(([title,detail],i)=><div key={title} className={s.flowRow}><span className={s.flowTerminal} data-current={index===i} aria-hidden="true"/><div className={s.flowNode} data-node={i} data-state={index>i||index===i&&i===4?'done':index===i?'active':'idle'}><span className={s.flowIcon}><Glyph name={index>i||index===4&&i===4?'check':i===3?'lock':i===0?'file':'branch'}/></span><div><strong>{title}</strong><small>{detail}</small></div><span className={s.flowState} data-current={index===i}>{index>i||index===4&&i===4?'Done':index===i?'Current':'Waiting'}</span></div></div>)}</div><div className={s.flowControls}><span aria-live={motion.running?'off':'polite'}>{index===4?'Example completed':index===3&&!approved?'Approval required':index<0?'Ready to run':'Example in progress'}</span>{index===3&&!approved?<button type="button" className={s.solid} onClick={()=>{setApproved(true);setIndex(4)}}>Approve example</button>:<button type="button" className={s.solid} disabled={index===4} onClick={()=>setIndex(i=>i+1)}>{index<0?'Run example':'Next step'} <Glyph name="arrow"/></button>}</div><div className={s.appFoot}>Simulation only · No external actions are executed.</div></div></Frame>}
export function WebsiteDemo(){
  const [mobile,setMobile]=useState(false);
  const [page,setPage]=useState<FieldPage>('home');
  const [category,setCategory]=useState<FieldCategory>('broths');
  const [selected,setSelected]=useState(0);
  const [party,setParty]=useState<FieldParty>(2);
  const [day,setDay]=useState<FieldDay>('Fri');
  const [time,setTime]=useState<FieldTime>('18:00');
  const [review,setReview]=useState(false);
  const motion=usePreviewMotion(step=>{
    // Deliberate shots, not wholesale remounts: responsive layout, menu interaction,
    // then a visit flow with a review. The demo never makes a real reservation.
    switch(step%9){
      case 0:setMobile(true);setPage('home');break;
      case 1:setPage('menu');setCategory('broths');setSelected(0);break;
      case 2:setSelected(1);break;
      case 3:setMobile(false);break;
      case 4:setCategory('ingredients');setSelected(0);break;
      case 5:setPage('contact');setParty(2);setDay('Fri');setTime('18:00');setReview(false);break;
      case 6:setParty(4);setDay('Sat');setTime('19:30');break;
      case 7:setReview(true);break;
      case 8:setPage('home');setCategory('broths');setSelected(0);setReview(false);break;
    }
  },3400);
  return <Frame tone="web" title="Web / Responsive preview" motion={motion} action={<div className={s.switch}><button type="button" aria-label="Desktop preview" aria-pressed={!mobile} onClick={()=>setMobile(false)}><Glyph name="monitor"/></button><button type="button" aria-label="Mobile preview" aria-pressed={mobile} onClick={()=>setMobile(true)}><Glyph name="phone"/></button></div>}>
    <div className={`${s.webStage} ${field.stage}`} data-device={mobile?'mobile':'desktop'} data-running={motion.running}>
      <FieldTable {...{page,setPage,mobile,running:motion.running,category,setCategory,selected,setSelected,party,setParty,day,setDay,time,setTime,review,setReview}}/>
    </div>
    <div className={s.appFoot}>Sunlit Hotpot · Responsive website showcase</div>
  </Frame>
}
