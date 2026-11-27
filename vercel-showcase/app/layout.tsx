import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { isPreview, siteUrl } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'Cedar & Cursor — Digital Technology Studio',
  description: 'Websites, software and AI tools that make businesses work better.',
  icons: { icon: '/logo.svg' },
  robots: isPreview() ? { index: false, follow: false } : { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
