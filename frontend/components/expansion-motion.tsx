'use client';

import {useEffect,useRef,useState} from 'react';

/** A sample scene advances only while visible, foregrounded and opted in. */
export function usePreviewMotion(advance:(step:number)=>void,interval=3200){
  const ref=useRef<HTMLDivElement>(null);
  const callback=useRef(advance);
  const step=useRef(0);
  const [enabled,setEnabled]=useState(true);
  const [visible,setVisible]=useState(false);
  const [foreground,setForeground]=useState(false);
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{callback.current=advance},[advance]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference=()=>setReduced(media.matches);
    const syncForeground=()=>setForeground(document.visibilityState==='visible');
    syncPreference();syncForeground();
    media.addEventListener('change',syncPreference);
    document.addEventListener('visibilitychange',syncForeground);
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting&&entry.intersectionRatio>=.2),{threshold:[0,.2]});
    if(ref.current)observer?.observe(ref.current);
    return()=>{observer?.disconnect();media.removeEventListener('change',syncPreference);document.removeEventListener('visibilitychange',syncForeground)};
  },[]);
  const inView=visible&&foreground;
  const running=enabled&&inView&&!reduced;
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>callback.current(step.current++),interval);
    return()=>window.clearInterval(timer);
  },[running,interval]);
  return {ref,enabled,running,reduced,inView,pause:()=>setEnabled(false),toggle:()=>setEnabled(v=>!v)};
}
export type PreviewMotion=ReturnType<typeof usePreviewMotion>;

/** Progressive enhancement: content remains visible before hydration or without observers. */
export function StudioScrollMotion(){
  useEffect(()=>{
    if(typeof IntersectionObserver==='undefined'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        // Don't replay an entrance effect on elements already at the top of the viewport.
        if(entry.boundingClientRect.top>0)entry.target.setAttribute('data-studio-reveal','entered');
        observer.unobserve(entry.target);
      }
    },{threshold:0,rootMargin:'0px 0px -6% 0px'});
    document.querySelectorAll('[data-studio-reveal]').forEach(el=>observer.observe(el));
    return()=>observer.disconnect();
  },[]);
  return null;
}
