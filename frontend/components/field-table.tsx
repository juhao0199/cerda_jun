'use client';

import {useEffect,useRef} from 'react';
import type {CSSProperties} from 'react';
import s from './field-table.module.css';
import brandPalette from './sunlit-brand.json';

export type FieldPage='home'|'menu'|'contact';
export type FieldCategory='broths'|'ingredients'|'greens';
export type FieldParty=2|3|4|6;
export type FieldDay='Fri'|'Sat'|'Sun';
export type FieldTime='18:00'|'19:30'|'21:00';
const photos={mala:'menu1',golden:'menu2',split:'menu3',feast:'menu4',meat:'ingredient-meat',seafood:'ingredient-seafood',vegetables:'ingredient-veg',mushrooms:'ingredient-mushroom',interior:'interior-dining',exterior:'night-exterior'} as const;
type PhotoKey=keyof typeof photos;
const site='https://www.sunlit-hotpot-bkk.com/';
export const fieldMenu={
  broths:[{name:'Chongqing Mala Pot',description:'Red oil, chilli and Sichuan peppercorn',tag:'Bold',art:'mala'},{name:'Golden Comfort Broth',description:'A mellow broth for a gentler table',tag:'Mild',art:'golden'},{name:'Half Fire, Half Comfort',description:'Two broths to share in one pot',tag:'Dual',art:'split'}],
  ingredients:[{name:'Sliced meat',description:'Thin cuts for the bubbling pot',tag:'Meat',art:'meat'},{name:'Seafood selection',description:'Explore the seafood ingredients',tag:'Seafood',art:'seafood'},{name:'Premium ingredient feast',description:'A generous table of hotpot ingredients',tag:'Share',art:'feast'}],
  greens:[{name:'Fresh greens',description:'Leafy vegetables for either broth',tag:'Greens',art:'vegetables'},{name:'Mushroom selection',description:'Mushrooms for a fragrant, savoury bite',tag:'Fungi',art:'mushrooms'},{name:'Tofu and vegetables',description:'Balance the heat with lighter ingredients',tag:'Mix',art:'golden'}],
} as const;
export const fieldCategories=[['broths','Soup bases'],['ingredients','Meat & seafood'],['greens','Greens & mushrooms']] as const;
export const fieldDays=[['Fri','Friday'],['Sat','Saturday'],['Sun','Sunday']] as const;
export const fieldTimes=['18:00','19:30','21:00'] as const;
const menuPhotos=['mala','golden','split','meat','seafood','feast','vegetables','mushrooms'] as const;
/* Same-origin portfolio assets. No remote browser requests or booking API calls. */
function SunlitPhoto({photo,alt=''}:{photo:PhotoKey;alt?:string}){
  return <div className={s.photoSurface} data-photo={photo}>
    <span className={s.photoFallback} aria-hidden="true">SUNLIT<br/>HOT POT</span>
    {/* Native image keeps local assets independent of remote Next image configuration. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={s.photo} src={`/showcase/sunlit/${photos[photo]}.jpg`} alt={alt} decoding="async" draggable={false} onError={e=>{e.currentTarget.style.visibility='hidden'}}/>
  </div>
}

function Arrow(){return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
type Props={page:FieldPage;setPage:(p:FieldPage)=>void;mobile:boolean;running:boolean;category:FieldCategory;setCategory:(c:FieldCategory)=>void;selected:number;setSelected:(i:number)=>void;party:FieldParty;setParty:(p:FieldParty)=>void;day:FieldDay;setDay:(d:FieldDay)=>void;time:FieldTime;setTime:(t:FieldTime)=>void;review:boolean;setReview:(v:boolean)=>void};
const nav=[['home','Home'],['menu','Menu'],['contact','Visit']] as const;
export function FieldTable(p:Props){
  const visitRef=useRef<HTMLDivElement>(null);
  const bookingRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!p.running||p.page!=='contact')return;
    const panel=visitRef.current,booking=bookingRef.current;
    if(!panel||!booking||panel.clientWidth>620)return;
    // On a narrow preview, bring the relevant controls into view without moving the outer page.
    panel.scrollTo({top:p.party===4||p.review?Math.max(0,booking.offsetTop-12):0,behavior:'smooth'});
  },[p.page,p.running,p.party,p.review]);
  const selectedItem=fieldMenu[p.category][p.selected];
  const navIndex=nav.findIndex(([id])=>id===p.page);
  return <div className={s.browser} style={brandPalette as CSSProperties} data-mobile={p.mobile} data-running={p.running}>
    <div className={s.nav}><span className={s.wordmark}>SUNLIT HOTPOT<small>叁两老火锅 · Bangkok</small></span><div className={s.navTabs} style={{'--nav-index':navIndex} as CSSProperties}>{nav.map(([id,label])=><button key={id} type="button" aria-pressed={p.page===id} onClick={()=>p.setPage(id)}>{label}</button>)}<span className={s.navIndicator} aria-hidden="true"/></div><button className={s.navCta} type="button" onClick={()=>p.setPage('contact')}>Book a table <Arrow/></button></div>
    <div className={s.panels}>
      <div className={`${s.panel} ${s.homePanel}`} data-active={p.page==='home'} inert={p.page!=='home'} aria-hidden={p.page!=='home'}>
        <div className={s.homeCopy}><span className={s.kicker}><span/> Chongqing hotpot · Ekkamai</span><h4>A table worth<br/>gathering around.</h4><p>Discover Chongqing-style hotpot in Ekkamai, from fragrant mala to mellow golden broth. Share a table, choose your ingredients and make an evening of it.</p><div className={s.homeActions}><button className={s.primary} type="button" onClick={()=>p.setPage('menu')}>Explore the menu <Arrow/></button><button className={s.textAction} type="button" onClick={()=>p.setPage('contact')}>Plan a visit <Arrow/></button></div><div className={s.homeNotes}><div><span>Signature broths</span><strong>Mala &amp; golden broth</strong></div><div><span>Open daily</span><strong>12 PM – 3 AM</strong></div></div></div>
        <div className={s.heroArt}><SunlitPhoto photo="mala" alt="Sunlit Hotpot Chongqing mala broth"/><div className={s.artBottom}><span>Chongqing mala hotpot</span><span>Sunlit · Bangkok</span></div></div>
      </div>
      <div className={`${s.panel} ${s.menuPanel}`} data-active={p.page==='menu'} inert={p.page!=='menu'} aria-hidden={p.page!=='menu'}>
        <div className={s.menuHeader}><div><span className={s.kicker}><span/> Menu highlights</span><h4>Find your flavour.</h4></div><p>Explore signature broths and ingredients.</p></div>
        <div className={s.menuTabs}>{fieldCategories.map(([id,label])=><button key={id} type="button" aria-pressed={p.category===id} onClick={()=>{p.setCategory(id);p.setSelected(0)}}>{label}</button>)}</div>
        <div className={s.menuGrid}><div className={s.menuList}>{fieldMenu[p.category].map((item,i)=><button key={i} type="button" className={s.menuItem} aria-pressed={i===p.selected} onClick={()=>p.setSelected(i)}><span className={s.itemNumber}>0{i+1}</span><span><strong>{item.name}</strong><small>{item.description}</small></span><span className={s.price}>{item.tag}<Arrow/></span></button>)}</div><div className={s.menuFeature}><div className={s.menuArt}>{menuPhotos.map(art=><div key={art} className={s.menuArtLayer} data-current={selectedItem.art===art}><SunlitPhoto photo={art}/></div>)}</div><div className={s.menuCaption}><span>On the menu</span><strong>{selectedItem.name}</strong></div></div></div>
        <div className={s.menuFooter}><span>Selected menu highlights · Check current prices on the live site</span><button className={s.textAction} type="button" onClick={()=>p.setPage('contact')}>Plan a visit <Arrow/></button></div>
      </div>
      <div ref={visitRef} className={`${s.panel} ${s.visitPanel}`} data-active={p.page==='contact'} inert={p.page!=='contact'} aria-hidden={p.page!=='contact'}>
        <div className={s.visitInfo}><span className={s.kicker}><span/> Ekkamai, Bangkok</span><h4>Meet in Ekkamai.</h4><p>6/2 Soi Ekkamai 12, Khlong Tan Nuea, Watthana, Bangkok 10110.</p><div className={s.visitMap}><SunlitPhoto photo="exterior" alt="Sunlit Hotpot exterior at night"/><span>Ekkamai 12</span></div><div className={s.hours}><div><small>Open daily</small><strong>12:00 PM – 3:00 AM</strong></div><div><small>Reservations</small><strong>+66 81 160 7330</strong></div></div></div>
        <div ref={bookingRef} className={s.booking}><div className={s.bookingHeading}><div><span className={s.kicker}>Reservation preview</span><h5>Choose a table</h5></div><span>Demo only</span></div><div className={s.bookingSteps}><span data-done={true}/><span data-done={p.review}/></div><div className={s.bookingContent}><div className={s.bookingFields} data-review={p.review} inert={p.review} aria-hidden={p.review}><div><span className={s.fieldLabel}>Party size</span><div className={s.choices}>{([2,3,4,6] as const).map(n=><button key={n} type="button" aria-label={`${n} guests`} aria-pressed={p.party===n} onClick={()=>{p.setParty(n);p.setReview(false)}}>{n}</button>)}</div></div><div><span className={s.fieldLabel}>Day (example)</span><div className={s.choices}>{fieldDays.map(([id,label])=><button key={id} type="button" aria-label={label} aria-pressed={p.day===id} onClick={()=>{p.setDay(id);p.setReview(false)}}>{id}</button>)}</div></div><div><span className={s.fieldLabel}>Time (example)</span><div className={s.choices}>{fieldTimes.map(t=><button key={t} type="button" aria-pressed={p.time===t} onClick={()=>{p.setTime(t);p.setReview(false)}}>{t}</button>)}</div></div></div><div className={s.bookingReview} data-review={p.review} inert={!p.review} aria-hidden={!p.review}><span className={s.reviewMark}>✓</span><strong>Your visit preview</strong><p>{p.party} guests · {fieldDays.find(([id])=>id===p.day)?.[1]} · {p.time}</p><small>No reservation has been made.</small></div></div><button className={s.primary} type="button" onClick={()=>p.setReview(!p.review)}>{p.review?'Edit selection':'Preview reservation'} <Arrow/></button><button className={s.textAction} type="button" onClick={()=>p.setPage('home')}>Return home <Arrow/></button></div>
      </div>
    </div>
    <div className={s.siteFoot}><span>Project preview · No live reservation</span><a href={site} target="_blank" rel="noopener noreferrer">View live website <Arrow/></a></div>
  </div>
}
