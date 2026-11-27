import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { publicArticle } from '@/lib/blog-server';
import { pageMetadata } from '@/lib/website-server';
import { breadcrumb, organizationId, siteUrl } from '@/lib/site';
import { safeJsonLd } from '@/lib/website-schema';
import { servicePages } from '@/lib/service-content';

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return servicePages.map(({slug}) => ({slug})); }
export const dynamicParams = false;
function getService(slug: string) { return servicePages.find(service => service.slug === slug) ?? notFound(); }

export async function generateMetadata({ params }: Props) {
  const service = getService((await params).slug);
  return pageMetadata(`${service.label} | Cedar & Cursor`, service.summary, `/services/${service.slug}`);
}

export default async function ServicePage({ params }: Props) {
  const service = getService((await params).slug);
  const path = `/services/${service.slug}`;
  const url = `${siteUrl()}${path}`;
  const [requestHeaders, guide] = await Promise.all([
    headers(),
    publicArticle(service.article).catch(() => null),
  ]);
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const graph = { '@context':'https://schema.org', '@graph': [
    { '@type':'Service', '@id':`${url}#service`, url, name:service.label, description:service.summary, provider:{'@id':organizationId()} },
    breadcrumb([{ name:'Home', path:'/' }, { name:service.label, path }]),
  ] };
  return <main id="main" className="article-page">
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:safeJsonLd(graph)}} />
    <article className="wrap article-wrap">
      <nav aria-label="Breadcrumb" className="page-crumb"><Link href="/">Home</Link> <span>/</span> {service.label}</nav>
      <div className="article-intro" data-cedar-route=""><span>{service.label}</span><h1>{service.title}</h1><p>{service.summary}</p></div>
      <div className="article-body">
        <h2>What to agree for your project</h2>
        <ul>{service.outcomes.map(outcome => <li key={outcome}>{outcome}</li>)}</ul>
        {service.decisions.map(decision => <section key={decision.title}><h2 data-cedar-reveal="copy">{decision.title}</h2><p>{decision.body}</p></section>)}
        <section><h2>{service.question}</h2><p>{service.answer}</p></section>
        <aside className="reading-next" data-cedar-reveal="surface" aria-label="Explore this service">
          <Link href={`/#${service.demo}`}>See the interactive example</Link>
          {guide && <Link href={`/blog/${service.article}`}>Read the related guide</Link>}
          <Link href="/#contact" className="btn darkbtn">Discuss this project</Link>
        </aside>
      </div>
    </article>
  </main>;
}
