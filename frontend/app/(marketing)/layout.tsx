import type { ReactNode } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { PublicMotion } from '@/components/public-motion';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <><Header /><PublicMotion>{children}</PublicMotion><footer><div className="wrap foot"><Link className="brand" href="/">Cedar &amp; Cursor</Link><span>Rooted in craft. Built for tomorrow.</span><div className="footer-links"><Link href="/blog">Insights</Link><Link href="/#contact">Contact</Link><Link href="/privacy">Privacy</Link></div></div></footer></>;
}
