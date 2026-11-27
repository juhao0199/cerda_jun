import { notFound } from 'next/navigation';
import { publicOnly } from '@/lib/deployment';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/workspace/shell';

export const metadata: Metadata = {
  title: 'Workspace | Cedar & Cursor',
  robots: { index: false, follow: false },
};
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  if (publicOnly) notFound();
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
