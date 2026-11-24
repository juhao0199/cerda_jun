import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/workspace/shell';

export const metadata: Metadata = {
  title: 'Workspace | Cedar & Cursor',
  robots: { index: false, follow: false },
};
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
