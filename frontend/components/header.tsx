'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import s from './header.module.css';

const solutions = [
  {id:'studio-web', title:'Web experiences', detail:'Websites, digital menus and content systems', number:'01'},
  {id:'studio-operations', title:'Business software', detail:'Internal tools, CRM and connected operations', number:'02'},
  {id:'studio-knowledge', title:'AI systems', detail:'Knowledge assistants and practical AI', number:'03'},
  {id:'studio-workflows', title:'Automation', detail:'Integrated workflows and human review', number:'04'},
] as const;
const links = [{id:'services',title:'Services'},{id:'process',title:'Process'},{id:'about',title:'About'},{id:'contact',title:'Contact'}] as const;
const watched = ['home','studio-solutions',...solutions.map(x=>x.id),'services','estimate','studio-applications','studio-questions','process','insights','about','faq','contact'];
const solutionIds = new Set<string>(['studio-solutions','studio-applications','studio-questions',...solutions.map(x=>x.id)]);

function Arrow({diagonal=false}:{diagonal?:boolean}) {
  return <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{diagonal?<path d="M4 12 12 4M5 4h7v7"/>:<path d="M2.5 8h10m-4-4 4 4-4 4"/>}</svg>;
}

export function Header(){
  const pathname=usePathname();
  const home=pathname==='/';
  const [active,setActive]=useState('home');
  const [dark,setDark]=useState(home);
  const [expanded,setExpanded]=useState<'solutions'|'mobile'|null>(null);
  const root=useRef<HTMLElement>(null);
  const progress=useRef<HTMLDivElement>(null);
  const solutionsTrigger=useRef<HTMLButtonElement>(null);
  const mobileTrigger=useRef<HTMLButtonElement>(null);
  const close=()=>setExpanded(null);

  useEffect(()=>{
    let frame=0;
    function update(){
      const y=window.scrollY, height=root.current?.offsetHeight??70;
      const total=document.documentElement.scrollHeight-window.innerHeight;
      if(progress.current)progress.current.style.transform=`scaleX(${total>0?Math.max(0,Math.min(1,y/total)):0})`;
      const hero=home?document.getElementById('home'):null;
      setDark(Boolean(hero&&hero.getBoundingClientRect().bottom>height+4));
      if(!home){setActive('');return;}
      const boundary=height+Math.min(window.innerHeight*.2,130);
      let current='home', nearest=-Infinity;
      for(const id of watched){const el=document.getElementById(id);if(!el)continue;const top=el.getBoundingClientRect().top;if(top<=boundary&&top>=nearest){nearest=top;current=id;}}
      setActive(current);
    }
    function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;update();});}
    update();
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    window.addEventListener('hashchange',schedule);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
    const main=document.querySelector('main');if(main)observer?.observe(main);
    return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('hashchange',schedule);observer?.disconnect();cancelAnimationFrame(frame);};
  },[home,pathname]);

  useEffect(()=>{
    const media=window.matchMedia('(max-width: 1050px)');
    function resize(){setExpanded(null);}
    media.addEventListener('change',resize);
    return()=>media.removeEventListener('change',resize);
  },[]);
  useEffect(()=>{setExpanded(null);},[pathname]);
  useEffect(()=>{
    if(!expanded)return;
    const trigger=expanded==='mobile'?mobileTrigger:solutionsTrigger;
    function key(e:KeyboardEvent){if(e.key==='Escape'){setExpanded(null);trigger.current?.focus();}}
    function outside(e:PointerEvent){if(e.target instanceof Node&&!root.current?.contains(e.target))setExpanded(null);}
    function focus(e:FocusEvent){if(e.target instanceof Node&&!root.current?.contains(e.target))setExpanded(null);}
    window.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);document.addEventListener('focusin',focus);
    return()=>{window.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',focus);};
  },[expanded]);

  const current=(id:string)=>home&&active===id?'location' as const:undefined;
  const blog=pathname==='/blog'||pathname.startsWith('/blog/');
  return <><a className="skip" href="#main">Skip to content</a>
    <header ref={root} className={s.header} data-tone={dark?'dark':'light'} data-expanded={expanded??'none'}>
      <nav className={s.nav} aria-label="Main navigation">
        <Link className={s.brand} href="/#home" onClick={close} aria-label="Cedar & Cursor home"><img src="/logo.svg" width={32} height={32} alt=""/><span>Cedar &amp; Cursor</span></Link>
        <div className={s.desktopLinks}>
          <div className={s.disclosure}>
            <button ref={solutionsTrigger} type="button" className={s.navItem} data-active={home&&solutionIds.has(active)} aria-expanded={expanded==='solutions'} aria-controls="cedar-solutions-nav" onClick={()=>setExpanded(x=>x==='solutions'?null:'solutions')}>Solutions <svg className={s.chevron} aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            <div id="cedar-solutions-nav" className={s.panel} hidden={expanded!=='solutions'}>
              <div className={s.panelIntro}><span className={s.kicker}>WHAT WE BUILD</span><p>Technology that fits the way you work.</p><Link href="/#studio-solutions" onClick={close} className={s.overview}>Explore all solutions <Arrow/></Link></div>
              <div className={s.solutionList}>{solutions.map(item=><Link key={item.id} href={'/#'+item.id} aria-current={current(item.id)} onClick={close} className={s.solutionLink}><span className={s.number}>{item.number}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><Arrow/></Link>)}</div>
              <Link href="/#studio-applications" className={s.panelFoot} onClick={close}>Industries &amp; business applications <Arrow/></Link>
            </div>
          </div>
          {links.slice(0,3).map(item=><Link key={item.id} href={'/#'+item.id} aria-current={current(item.id)} className={s.navItem} onClick={close}>{item.title}</Link>)}
          <Link href="/blog" className={s.navItem} aria-current={blog?'page':undefined} onClick={close}>Blog</Link>
          <Link href="/#contact" className={s.navItem} aria-current={current('contact')} onClick={close}>Contact</Link>
        </div>
        <div className={s.actions}><Link className={s.estimate} href="/#estimate" aria-current={current('estimate')} onClick={close}>Estimate</Link><Link className={s.cta} href="/#contact" onClick={close}>Start a project <Arrow diagonal/></Link></div>
        <button ref={mobileTrigger} className={s.mobileTrigger} type="button" aria-controls="cedar-mobile-nav" aria-expanded={expanded==='mobile'} onClick={()=>setExpanded(x=>x==='mobile'?null:'mobile')} aria-label={expanded==='mobile'?'Close menu':'Open menu'}><span>{expanded==='mobile'?'Close':'Menu'}</span><span className={s.menuGlyph} aria-hidden="true"><i/><i/></span></button>
        <div id="cedar-mobile-nav" hidden={expanded!=='mobile'} className={s.mobilePanel}>
          <span className={s.kicker}>SOLUTIONS</span>
          {solutions.map(item=><Link key={item.id} href={'/#'+item.id} aria-current={current(item.id)} onClick={close} className={s.mobileSolution}><span className={s.number}>{item.number}</span>{item.title}<Arrow/></Link>)}
          <div className={s.mobileLinks}>{links.map(item=><Link key={item.id} href={'/#'+item.id} aria-current={current(item.id)} onClick={close}>{item.title}</Link>)}<Link href="/blog" aria-current={blog?'page':undefined} onClick={close}>Blog</Link><Link href="/#studio-applications" onClick={close}>Industries</Link></div>
          <div className={s.mobileActions}><Link className={s.mobileEstimate} href="/#estimate" onClick={close}>Estimate a project <Arrow/></Link><Link className={s.mobileCta} href="/#contact" onClick={close}>Start a project <Arrow diagonal/></Link></div>
        </div>
      </nav>
      <div ref={progress} className={s.progress} aria-hidden="true"/>
    </header></>;
}
