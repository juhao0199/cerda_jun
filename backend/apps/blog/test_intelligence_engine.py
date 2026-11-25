import unittest
import time
from unittest.mock import patch
from .intelligence_engine import (Robots, allowed_path, public_ip, local_path, resolve, fetch, scan, sitemap, inspect_page, published_headings, rule_matches)


def reply(body='',status=200,kind='text/html'):
    return dict(body=body,status=status,type=kind,ms=20,error='',robots='',location='')


class IntelligenceEngineTests(unittest.TestCase):
    def test_public_ip_and_dns_mixed_results(self):
        for ip in ('127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','224.0.0.1','::1','::ffff:8.8.8.8','2002:0808:0808::1'):
            self.assertFalse(public_ip(ip),ip)
        self.assertTrue(public_ip('8.8.8.8'))
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',443)),(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(ValueError):resolve('example.org',1)
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('8.8.8.8',443))]) as dns:
            self.assertEqual(resolve('example.org',1),'8.8.8.8');dns.assert_called_once()

    def test_slow_dns_can_finish_within_request_budget(self):
        def slow_dns(*args, **kwargs):
            time.sleep(2.1)
            return [(2,1,6,'',('8.8.8.8',443))]
        with patch('socket.getaddrinfo',side_effect=slow_dns) as dns:
            self.assertEqual(resolve('example.org',5),'8.8.8.8')
            dns.assert_called_once_with('example.org.',443,type=1)

    def test_fetch_reuses_only_public_address_for_exact_host(self):
        cache={}
        with patch('apps.blog.intelligence_engine.resolve',return_value='8.8.8.8') as dns, patch('socket.socket') as sock:
            sock.return_value.connect.side_effect=OSError('test transport failure')
            for path in ('/robots.txt','/','/sitemap.xml'):
                result=fetch('example.org',path,time.monotonic()+5,dns_cache=cache)
                self.assertEqual(result['error'],'TCP connection failed.')
            self.assertEqual(dns.call_count,1)
            self.assertEqual(sock.return_value.connect.call_count,3)
            fetch('www.example.org','/robots.txt',time.monotonic()+5,dns_cache=cache)
            self.assertEqual(dns.call_count,2)
            cache['example.org']='127.0.0.1'
            result=fetch('example.org','/',time.monotonic()+5,dns_cache=cache)
            self.assertIn('rejected',result['error'])
            self.assertEqual(sock.return_value.connect.call_count,4)

    def test_default_scan_cache_is_fresh_for_every_scan(self):
        caches=[]; now=[0.]
        def network(host,path,deadline,*,dns_cache):
            caches.append(dns_cache)
            dns_cache.setdefault(host,'8.8.8.8')
            if path=='/robots.txt':return reply('User-agent: *',kind='text/plain')
            if path=='/':return reply('<body><h1>Home</h1></body>')
            return reply(status=404)
        with patch('apps.blog.intelligence_engine.fetch',side_effect=network):
            for _ in range(2):
                report=scan('example.org',clock=lambda:now[0],sleep=lambda n:now.__setitem__(0,now[0]+n))
                self.assertEqual(report['measured'],1)
        self.assertEqual(len(caches),6)
        self.assertIs(caches[0],caches[1]);self.assertIs(caches[1],caches[2])
        self.assertIs(caches[3],caches[4]);self.assertIs(caches[4],caches[5])
        self.assertIsNot(caches[0],caches[3])

    def test_paths_and_redirect_boundaries(self):
        for value in ('https://evil.org/','//evil.org/','https://example.org:443/','https://a@example.org/','/api/private','/login.html','/a?secret=1','/%2e%2e/a','/admin/','/x\\y','/image.jpg'):
            self.assertIsNone(local_path(value,'example.org'),value)
        self.assertEqual(local_path('/blog/guide#anchor','example.org'),'/blog/guide')
        self.assertFalse(allowed_path('/a/../b'))

    def test_robots_longest_match_and_agent(self):
        r=Robots('User-agent: *\nDisallow: /private\nDisallow: /*secret$\nAllow: /private/public\nUser-agent: GPTBot\nDisallow: /')
        self.assertFalse(r.allows('/private/a'));self.assertTrue(r.allows('/private/public/a'));self.assertFalse(r.allows('/a/secret'));self.assertTrue(r.allows('/a/secret-more'))
        self.assertFalse(Robots('User-agent: GPTBot\nDisallow: /','GPTBot').allows('/'))
        self.assertTrue(rule_matches('/a*b*c$', '/a123b456c'))
        with self.assertRaises(ValueError):Robots('User-agent: *\nCrawl-delay: 30')
        with self.assertRaises(ValueError):Robots('User-agent: *\nDisallow: /%2f')

    def test_sitemap_and_html_evidence(self):
        _,paths,_=sitemap('<urlset><url><loc>https://example.org/services</loc></url><url><loc>https://evil.org/x</loc></url></urlset>','example.org')
        self.assertEqual(paths,['/services'])
        with self.assertRaises(ValueError):sitemap('<!DOCTYPE x><urlset/>','example.org')
        body='<html><head><title>Useful studio</title><meta name="description" content="Software"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Custom software</h1><h2>What is automation?</h2><ul><li>Answer</li></ul><a href="/services">Services</a><a href="https://source.org/">Reference</a><script>hidden secret</script></body></html>'
        p,links=inspect_page('/','example.org',reply(body));self.assertTrue(p['measured']);self.assertTrue(p['checks']['aeo']['questionHeading']);self.assertEqual(p['schemaTypes'],['Organization']);self.assertEqual(links,['/services']);self.assertNotIn('hidden secret',str(p))
        self.assertEqual(published_headings({'title':'Guide','sections':[{'heading':'Custom software','body':'Secret'}]}),'guide custom software')

    def test_scan_respects_robots_and_stops_on_limit(self):
        calls=[];now=[0.]
        def fetcher(host,path,deadline):
            calls.append((host,path));now[0]+=.1
            if path=='/robots.txt':return reply('User-agent: *\nDisallow: /blocked\nSitemap: https://example.org/sitemap.xml',kind='text/plain')
            if path=='/':return reply('<body><h1>Home</h1><a href="/blocked">Blocked</a><a href="/about">About</a><a href="https://evil.org/">External</a></body>')
            if path=='/sitemap.xml':return reply('<urlset><url><loc>https://example.org/blog</loc></url></urlset>',kind='application/xml')
            if path=='/blog':return reply(status=429)
            raise AssertionError(path)
        r=scan('example.org',fetcher=fetcher,clock=lambda:now[0],sleep=lambda n:now.__setitem__(0,now[0]+n))
        self.assertEqual([p for _,p in calls],['/robots.txt','/','/sitemap.xml','/blog']);self.assertEqual(r['measured'],1);self.assertEqual(r['requests'],4)

    def test_scan_fails_closed_when_robots_unavailable(self):
        calls=[]
        def fetcher(host,path,deadline):calls.append((host,path));return reply(status=503)
        r=scan('example.org','www',fetcher=fetcher)
        self.assertEqual(calls,[('www.example.org','/robots.txt')]);self.assertEqual(r['state'],'incomplete');self.assertEqual(r['measured'],0)

    def test_canonical_robots_redirect_uses_destination_policy(self):
        calls=[];now=[0.]
        def fetcher(host,path,deadline):
            calls.append((host,path))
            if host=='example.org':
                self.assertEqual(path,'/robots.txt')
                return {**reply(status=308), 'location':'https://www.example.org/robots.txt'}
            if path=='/robots.txt':return reply('User-agent: *\nDisallow: /private',kind='text/plain')
            if path=='/':return reply('<h1>Home</h1><a href="/private">Private</a>')
            if path=='/sitemap.xml':return reply(status=404)
            raise AssertionError(path)
        r=scan('example.org',fetcher=fetcher,clock=lambda:now[0],sleep=lambda n:now.__setitem__(0,now[0]+n))
        self.assertEqual(calls,[('example.org','/robots.txt'),('www.example.org','/robots.txt'),('www.example.org','/'),('www.example.org','/sitemap.xml')])
        self.assertEqual(r['host'],'www.example.org');self.assertEqual(r['measured'],1);self.assertEqual(r['requests'],4)

    def test_robots_redirect_rejects_unsafe_targets_and_loops(self):
        for location in ('https://evil.org/robots.txt','http://www.example.org/robots.txt','https://www.example.org:443/robots.txt','https://www.example.org/private','https://www.example.org/robots.txt?x=1','https://www.example.org/robots.txt#x','https://user@www.example.org/robots.txt','/robots.txt'):
            with self.subTest(location=location):
                calls=[]
                def fetcher(host,path,deadline):
                    calls.append((host,path));return {**reply(status=301),'location':location}
                r=scan('example.org',fetcher=fetcher)
                self.assertEqual(calls,[('example.org','/robots.txt')]);self.assertEqual(r['robots'],'redirect refused');self.assertEqual(r['measured'],0)
        calls=[];now=[0.]
        def loop(host,path,deadline):
            calls.append((host,path));return {**reply(status=308),'location':'https://'+('www.example.org' if host=='example.org' else 'example.org')+'/robots.txt'}
        r=scan('example.org',fetcher=loop,clock=lambda:now[0],sleep=lambda n:now.__setitem__(0,now[0]+n))
        self.assertEqual(len(calls),2);self.assertEqual(r['robots'],'redirect refused')

    def test_robots_failure_diagnostics_no_fallback(self):
        for status,error in [(403,''),(429,''),(None,'DNS timed out.'),(None,'TLS certificate verification failed.')]:
            calls=[]
            def fetcher(host,path,deadline):
                calls.append((host,path));return {**reply(status=status),'error':error}
            r=scan('example.org',fetcher=fetcher)
            self.assertEqual(len(calls),1);self.assertEqual(r['measured'],0);self.assertIn(error or str(status),' '.join(r['notes']))
