import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cedar & Cursor — Digital Technology Studio',
  description: 'Websites, software and AI tools that make businesses work better.',
  icons: { icon: '/logo.svg' },
  openGraph: { title: 'Cedar & Cursor', description: 'Rooted in craft. Built for tomorrow.', type: 'website' },
};
export default async function RootLayout({children}: {children: ReactNode}) {
  await connection();
  return <html lang="en"><body>{children}</body></html>;
}
