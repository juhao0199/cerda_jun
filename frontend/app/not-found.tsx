import Link from 'next/link';
export default function NotFound() {
  return <main id="main" className="section"><div className="wrap" data-cedar-route=""><h1>Page not found</h1><p>The address may have changed. Explore the studio or browse our project guides.</p><Link className="btn darkbtn" href="/">Visit the studio</Link> <Link className="btn outline" href="/blog">Browse insights</Link></div></main>;
}
