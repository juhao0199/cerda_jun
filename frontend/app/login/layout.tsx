import { notFound } from 'next/navigation';
import { publicOnly } from '@/lib/deployment';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
export const metadata: Metadata = {title:'Sign in | Cedar & Cursor',robots:{index:false,follow:false}};
export default function LoginLayout({children}:{children:ReactNode}){
  if (publicOnly) notFound();
  return <div className="private-login"><div className="private-login-brand"><Link className="brand" href="/"><img src="/logo.svg" alt="" width={32} height={32}/>Cedar &amp; Cursor</Link></div>{children}</div>;
}
