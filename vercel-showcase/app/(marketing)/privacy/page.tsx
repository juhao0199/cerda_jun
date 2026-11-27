import Link from 'next/link';
import { studioEmail } from '@/lib/site';
import { pageMetadata } from '@/lib/website-server';

export const metadata = pageMetadata('Website privacy | Cedar & Cursor','How Cedar & Cursor uses the information you provide when getting in touch.','/privacy',true);
export default function Privacy() {
  return <main id="main" className="article-page"><article className="wrap article-wrap">
    <nav aria-label="Breadcrumb" className="page-crumb"><Link href="/">Home</Link> <span>/</span> Privacy</nav>
    <div className="article-intro"><h1>Website privacy</h1><p>What happens to the information you share with Cedar & Cursor.</p></div>
    <div className="article-body">
      <h2>When you get in touch</h2><p>If you submit an inquiry, Cedar & Cursor receives your name, email address, optional company name, project message and any estimate you attach. We use these details to respond and discuss the project. Hosting and email services process the submission so it can reach the studio.</p>
      <h2>When you plan a project</h2><p>The estimator runs in your browser. If you choose to export a project brief, it is downloaded to your device. Your estimate is included in an inquiry only when you attach it and submit the form.</p>
      <h2>Questions about your message</h2><p>Email <a href={`mailto:${studioEmail}`}>{studioEmail}</a> if you have a question or want to correct or remove information you sent. Please leave passwords, bank details and other sensitive information out of your project description.</p>
    </div>
  </article></main>;
}
