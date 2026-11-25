'use client';
import {useLayoutEffect,useRef} from 'react';

/** FLIP: keep the same DOM nodes while animating their changed positions.
 * Read geometry once per committed layout, then animate compositor transforms.
 * Never keep a React render loop or animate the grid's layout properties.
 */
export function useLayoutMotion(revision:string, reduced:boolean, running:boolean){
  const ref=useRef<HTMLDivElement>(null);
  const previous=useRef(new Map<string,DOMRect>());
  const active=useRef(new Map<Element,Animation>());
  useLayoutEffect(()=>{
    const root=ref.current;
    if(!root){previous.current.clear();return;}
    const nodes=Array.from(root.querySelectorAll<HTMLElement>('[data-layout-key]'));
    // Finish a previous move before measuring the new destination. The preview
    // cadence is much longer than the transition; rapid manual edits stay safe.
    for(const animation of active.current.values())animation.cancel();
    active.current.clear();
    const rects=nodes.map(node=>[node,node.getBoundingClientRect()] as const);
    const origin=root.getBoundingClientRect();
    const next=new Map<string,DOMRect>();
    const allow=!reduced&&running&&typeof Element.prototype.animate==='function';
    for(const [node,viewport] of rects){
      const rect=new DOMRect(viewport.left-origin.left,viewport.top-origin.top,viewport.width,viewport.height);
      const key=node.dataset.layoutKey!;
      const before=previous.current.get(key);
      next.set(key,rect);
      if(!allow||!before||!rect.width||!rect.height)continue;
      const dx=before.left-rect.left,dy=before.top-rect.top;
      if(Math.abs(dx)+Math.abs(dy)<1)continue;
      const animation=node.animate([{transform:`translate3d(${dx}px,${dy}px,0)`,zIndex:3},{transform:'translate3d(0,0,0)',zIndex:3}],{duration:720,easing:'cubic-bezier(.22,1,.36,1)'});
      active.current.set(node,animation);
      animation.onfinish=()=>{if(active.current.get(node)===animation)active.current.delete(node)};
    }
    previous.current=next;
  },[revision,reduced,running]);
  useLayoutEffect(()=>()=>{for(const animation of active.current.values())animation.cancel();active.current.clear();previous.current.clear()},[]);
  return ref;
}
