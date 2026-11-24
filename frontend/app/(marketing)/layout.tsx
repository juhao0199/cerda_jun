import type { ReactNode } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <><Header />{children}<footer><div className="wrap foot"><Link className="brand" href="/">Cedar &amp; Cursor</Link><span>Rooted in craft. Built for tomorrow.</span><Link href="/blog">Blog ↗</Link></div></footer></>;
}
