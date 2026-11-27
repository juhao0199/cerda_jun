import Link from 'next/link';
import { headers } from 'next/headers';
import { publicOnly } from '@/lib/deployment';
import { publicWebsite, websiteMetadata } from '@/lib/website-server';
import { websiteGraph, safeJsonLd } from '@/lib/website-content';
import { siteUrl, studioEmail } from '@/lib/site';
import { servicePages } from '@/lib/service-content';
import { isContactConfigured } from '@/lib/contact-delivery';
import { Hero } from '@/components/hero';
import { ProjectBuilder } from '@/components/project-builder';
import { Process, FAQ } from '@/components/process';
import { Insights } from '@/components/insights';
import { StudioExpansion, StudioMore } from '@/components/site-expansion';
import './home-editorial.css';

export async function generateMetadata() {
  return websiteMetadata((await publicWebsite()).fields, 'home');
}

export default async function Home() {
  const { fields, available } = await publicWebsite();
  const { copy } = fields;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const endpoint = publicOnly
    ? isContactConfigured(process.env) ? '/api/contact' : null
    : process.env.NEXT_PUBLIC_INQUIRY_MODE === 'live' ? '/api/inquiries' : null;

  return <main id="main" className="studio-home">
    {available && <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteGraph(fields, siteUrl())) }} />}
    <Hero intro={copy.heroIntro} />
    <StudioExpansion copy={copy} />
    <ProjectBuilder copy={copy} endpoint={endpoint} contactEmail={studioEmail} afterEstimate={<>
      <section className="section" id="service-guides">
        <div className="wrap">
          <div className="section-head"><h2>Choose the right first project.</h2><p>See what to prepare, scope and test before committing to a build.</p></div>
          <div className="service-guide-grid">
            {servicePages.map(service => <Link className="service-guide" href={`/services/${service.slug}`} key={service.slug}>
              <strong>{service.label}</strong><p>{service.summary}</p><span>Read the guide</span>
            </Link>)}
          </div>
        </div>
      </section>
      <StudioMore copy={copy} guidance={fields.guidance} />
      <Process copy={copy} />
      <Insights copy={copy} />
      <section className="section about-section" id="about">
        <div className="wrap about"><h2>{copy.aboutHeading}</h2><div><p>{copy.aboutIntro}</p><p className="tagline">Rooted in craft. Built for tomorrow.</p></div></div>
      </section>
      <FAQ copy={copy} questions={fields.faq} />
    </>} />
  </main>;
}
