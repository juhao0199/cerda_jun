import type {ReactNode} from 'react';

const drawings = {
  undo:<path d="m9 3-5 5 5 5M4 8h10a6 6 0 0 1 0 12"/>,
  redo:<path d="m15 3 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>,
  bold:<><path d="M6 4h7a4 4 0 0 1 0 8H6zm0 8h8a4 4 0 0 1 0 8H6z"/></>,
  italic:<path d="M11 4h8M5 20h8m3-16L8 20"/>,
  underline:<><path d="M6 3v9a6 6 0 0 0 12 0V3M4 21h16"/></>,
  strike:<path d="M5 12h14M7 7c0-4 11-5 11 0M6 17c0 5 12 5 12 0 0-2-3-3-6-4"/>,
  code:<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18"/>,
  link:<><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 1) scale(.92)"/></>,
  bullets:<><path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/></>,
  numbered:<><path d="M9 5h12M9 12h12M9 19h12M2 3h1v5M2 8h3m-3 3h2a1 1 0 0 1 1 1c0 1-3 2-3 4h3m-3 2h3l-2 2h2v2H2"/></>,
  quote:<path d="M10 5H4v8h6c0 4-2 6-6 6m16-14h-6v8h6c0 4-2 6-6 6"/>,
  blockCode:<><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8-4 4 4 4m4-8 4 4-4 4"/></>,
  divider:<path d="M4 12h16"/>,
  image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 5 5 3-3 4 4"/></>,
  table:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 15h18M9 4v16M15 4v16"/></>,
  expand:<path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"/>,
  collapse:<path d="M3 9h6V3m12 6h-6V3M9 21v-6H3m12 6v-6h6"/>,
  settings:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m3-12v2m0 3v2"/></>,
  back:<path d="m10 5-7 7 7 7M3 12h18"/>,
  check:<path d="m5 12 4 4L19 6"/>,
  trash:<><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
  edit:<><path d="m4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4"/></>,
  eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
} satisfies Record<string,ReactNode>;
export type EditorIconName=keyof typeof drawings;
export function EditorIcon({name}:{name:EditorIconName}){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{drawings[name]}</svg>;}
