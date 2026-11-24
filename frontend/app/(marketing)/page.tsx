import {Hero} from '@/components/hero';
import {ProjectBuilder} from '@/components/project-builder';
import {Process,FAQ} from '@/components/process';
import {Insights} from '@/components/insights';
export default function Home(){return <main id="main"><Hero/><ProjectBuilder afterEstimate={<><Process/><Insights/><section className="section about-section" id="about"><div className="wrap about"><h2>About the studio</h2><div><p>We work directly with businesses to turn their ideas into useful digital products, from a first website to a custom application.</p><p className="tagline">Rooted in craft. Built for tomorrow.</p></div></div></section><FAQ/></>}/></main>}
