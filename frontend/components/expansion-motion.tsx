'use client';

import {useEffect,useRef,useState} from 'react';

/** A sample scene advances only while visible, foregrounded and opted in. */
export function usePreviewMotion(advance:(step:number)=>void,interval=3200){
  const ref=useRef<HTMLDivElement>(null);
  const callback=useRef(advance);
  const step=useRef(0);
  const [playback,setPlayback]=useState<'auto'|'paused'|'play'>('auto');
  const [visibility,setVisibility]=useState({ intersects:false, enough:false });
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
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(([entry])=>setVisibility({ intersects:entry.isIntersecting, enough:entry.intersectionRatio>=.2 }),{threshold:[0,.2]});
    if(ref.current)observer?.observe(ref.current);
    return()=>{observer?.disconnect();media.removeEventListener('change',syncPreference);document.removeEventListener('visibilitychange',syncForeground)};
  },[]);
  const enabled=playback!=='paused';
  const inView=visibility.enough&&foreground;
  // A visitor can restart from the toolbar while only the top of a demo is visible.
  const running=enabled&&!reduced&&foreground&&(visibility.enough||(playback==='play'&&visibility.intersects));
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>callback.current(step.current++),interval);
    return()=>window.clearInterval(timer);
  },[running,interval]);
  return {ref,enabled,running,reduced,inView,pause:()=>setPlayback('paused'),toggle:()=>setPlayback(current=>current==='paused'?'play':'paused')};
}
export type PreviewMotion=ReturnType<typeof usePreviewMotion>;
