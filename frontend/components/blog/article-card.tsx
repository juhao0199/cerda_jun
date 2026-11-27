import Link from 'next/link';
import { coverPath, type PublicPost } from '@/lib/blog-content';
import { topicsFor } from '@/lib/blog-topics';
import styles from './article-card.module.css';

export function RelatedTopics({ topics }: { topics: string[] }) {
  return <div className={styles.topics}>
    <span className={styles.topicLabel}>Related topics</span>
    <ul className={styles.topicList} aria-label="Related topics">
      {topics.map(topic => <li key={topic}>{topic}</li>)}
    </ul>
  </div>;
}

export function ArticleCard({ post, headingLevel, eager }: { post: PublicPost; headingLevel: 2 | 3; eager: boolean }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const cover = coverPath(post.cover);
  const titleId = `article-${post.slug}`;
  const topics = topicsFor(post);

  return <article className={styles.card} data-cedar-reveal="card" data-cedar-spotlight="card">
    <Link className={styles.cardLink} href={`/blog/${post.slug}`} aria-labelledby={titleId} prefetch={false}>
      <div data-cedar-media="card">
        <img className={styles.cover} src={cover || '/share.png'} alt={cover ? post.coverAlt ?? '' : ''}
          width={1200} height={630} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      </div>
      <div className={styles.body}>
        <Heading id={titleId}>{post.title}</Heading>
        <p className={styles.meta}><span>By {post.author || 'Cedar & Cursor'}</span><span aria-hidden="true">·</span><span>{post.minutes} min read</span></p>
      </div>
    </Link>
    <div className={styles.cardFooter}><RelatedTopics topics={topics} /></div>
  </article>;
}

export function ArticleGrid({ posts, headingLevel, eagerCovers = false }: { posts: PublicPost[]; headingLevel: 2 | 3; eagerCovers?: boolean }) {
  return <div className={styles.grid}>
    {posts.map((post, index) => <ArticleCard key={post.slug} post={post} headingLevel={headingLevel} eager={eagerCovers && index < 3} />)}
  </div>;
}
