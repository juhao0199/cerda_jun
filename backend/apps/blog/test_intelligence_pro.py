import unittest
from .intelligence_engine import inspect_page, scan
from .intelligence_pro import next_sample, historical_delta, own_section_matches
from .test_intelligence_engine import reply

class IntelligenceProTests(unittest.TestCase):
    def test_diverse_discovery(self):
        paths=['/','/about','/agentic-readiness','/agentic-readiness/foundations','/products','/pricing','/blog/a','/blog','/solutions','/privacy']
        chosen={'/'};order=[]
        for _ in range(4):
            path=next_sample(paths,chosen);chosen.add(path);order.append(path)
        self.assertEqual(order,['/products','/solutions','/pricing','/blog'])

    def test_main_extraction_and_discovery_are_separate(self):
        body='''<html><head><title>Title</title></head><body><header><h1>Banner</h1></header><nav><a href="/pricing">Pricing</a><h2>Nav</h2></nav><main><h1>Real topic</h1><h2>What is it?</h2><p>This is a clear answer with at least eight words.</p><ol><li>First step</li></ol><dl><dt>Term</dt><dd>Meaning</dd></dl><img src="x"><img alt=""><img alt="A chart"><img role="presentation"><img aria-hidden="true"><p hidden>Ignore</p><a href="https://source.org">Source</a><a rel="author" href="/about">Author</a><time datetime="2026-01-01">Date</time><cite>Study</cite></main><footer><h2>Platform</h2><a href="https://social.example.org">Social</a></footer></body></html>'''
        row,links=inspect_page('/','example.org',reply(body))
        self.assertEqual(row['contentScope'],'main landmark')
        self.assertEqual([h['text'] for h in row['headings']],['Real topic','What is it?'])
        self.assertIn('/pricing',links)
        self.assertEqual(row['images'],5);self.assertEqual(row['missingAltAttribute'],1);self.assertEqual(row['emptyAlt'],1);self.assertEqual(row['decorativeImages'],2);self.assertEqual(row['nonemptyAlt'],1)
        self.assertEqual(row['contentExternalDomains'],1);self.assertEqual(row['externalDomains'],2)
        self.assertTrue(all(row['checks']['aeo'].values()))
        self.assertTrue(row['checks']['geo']['authorMarkup']);self.assertTrue(row['checks']['geo']['datedContent']);self.assertTrue(row['checks']['geo']['citationMarkup'])
        self.assertTrue(any(r['key']=='alt' for r in row['recommendations']))
        self.assertNotIn('This is a clear answer',str(row))

    def test_fallback_excludes_semantic_chrome(self):
        row,_=inspect_page('/about','example.org',reply('<body><div class="cookie-banner"><h2>Cookies?</h2></div><h1>Company</h1><div role="navigation"><h2>Nav</h2></div><footer><h2>Platform</h2></footer></body>'))
        self.assertEqual(row['contentScope'],'non-chrome HTML fallback');self.assertEqual(row['wordCount'],1)
        self.assertFalse(row['checks']['aeo']['questionHeading'])

    def test_history_compatible_and_no_removal_claim(self):
        def report(paths,title='Title',host='example.org',version=2):
            return {'host':host,'analysisVersion':version,'pages':[{'path':p,'measured':True,'title':title,'contentScope':'main landmark'} for p in paths]}
        a=report(['/','/new'],'Changed');b=report(['/','/old'])
        delta=historical_delta(a,b)
        self.assertEqual(delta,{'overlap':1,'newlySampled':['/new'],'notResampled':['/old'],'changes':[{'path':'/','fields':['title']}]})
        self.assertIsNone(historical_delta(a,report(['/'],version=1)))
        self.assertIsNone(historical_delta(a,report(['/'],host='www.example.org')))

    def test_own_inventory_is_separate(self):
        self.assertEqual(own_section_matches('business software')[0]['anchor'],'studio-operations')
        self.assertEqual(own_section_matches('imaginary rocket business'),[])

    def test_scan_diversity_keeps_limits_and_robots(self):
        now=[0.];calls=[]
        def fetcher(host,path,deadline):
            calls.append(path)
            if path=='/robots.txt':return reply('User-agent: *\nDisallow: /products',kind='text/plain')
            if path=='/sitemap.xml':return reply('<urlset/>',kind='application/xml')
            if path=='/':return reply('<body><nav>'+''.join(f'<a href="{p}">Link</a>' for p in ['/about','/other/a','/other/b','/products','/pricing','/blog','/solutions'])+'</nav><main><h1>Home</h1></main></body>')
            return reply('<body><main><h1>Sample</h1></main></body>')
        r=scan('example.org',fetcher=fetcher,clock=lambda:now[0],sleep=lambda n:now.__setitem__(0,now[0]+n))
        self.assertEqual(calls,['/robots.txt','/','/sitemap.xml','/solutions','/pricing','/blog','/about'])
        self.assertEqual(r['measured'],5);self.assertEqual(r['analysisVersion'],2)
        self.assertEqual(r['sampleKinds'],['company','home','pricing','resources','solutions'])
