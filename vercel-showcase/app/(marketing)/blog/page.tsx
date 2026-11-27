import { Insights } from '@/components/insights';
import { websiteMetadata } from '@/lib/website-server';

export const metadata = websiteMetadata('blog');
export default function BlogPage() {
  return <main id="main"><Insights all /></main>;
}
