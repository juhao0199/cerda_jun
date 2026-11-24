import type {Metadata} from 'next';
import {Insights} from '@/components/insights';
export const metadata:Metadata={title:'Insights | Cedar & Cursor',description:'Practical notes on websites, software and AI for business owners.'};
export default function BlogPage(){return <main id="main"><Insights all/></main>}
