import { notFound } from 'next/navigation';
import { WorkspaceView } from '@/components/workspace/views';
import { isSection } from '@/components/workspace/navigation';

export default async function WorkspaceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSection(section) || section === 'overview') notFound();
  return <WorkspaceView section={section} />;
}
