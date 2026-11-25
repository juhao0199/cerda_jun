import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from .crawler_policy import default_policy, render_robots, valid_policy
from .site_audit import run_audit, sitemap_paths, origin, local_path, public_path, safe_location

SITE='http://studio.example.test'


class SiteAuditTests(unittest.TestCase):
    def test_robots_groups_and_private_paths(self):
        policy=default_policy();policy['GPTBot']='block';policy['OAI-SearchBot']='allow'
        result=render_robots(policy,SITE)
        self.assertIn('User-agent: GPTBot\nDisallow: /\n',result)
        self.assertIn('User-agent: OAI-SearchBot\nAllow: /\nDisallow: /workspace',result)
        self.assertIn('Disallow: /internal/',result)
        self.assertNotIn('User-agent: ClaudeBot',result)
        self.assertFalse(valid_policy({**policy,'User-agent: *':'allow'}))
        self.assertFalse(valid_policy({**policy,'GPTBot':'allow\nAllow: /'}))

    def test_path_and_xml_boundaries(self):
        site=origin(SITE)
        for href in ('https://elsewhere.test/blog/a','//127.0.0.1/blog/a','/api/v1/auth/me','/workspace','/blog/%2e%2e','/blog/a?private=1','/login','/blog/a\\b'):
            self.assertIsNone(local_path(href,SITE+'/',site),href)
        self.assertEqual(local_path('/blog/hello#part',SITE+'/',site),'/blog/hello')
        self.assertFalse(public_path('/internal/'))
        self.assertEqual(safe_location('https://example.test/blog/a?secret=1#fragment'),'https://example.test/blog/a')
        with self.assertRaises(ValueError): sitemap_paths('<!DOCTYPE x><x/>',site)
        with self.assertRaises(ValueError): origin('http://user:password@host.test')

    def test_real_http_without_redirect_follow_or_external_requests(self):
        seen=[]; expected=render_robots(default_policy(),SITE)
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_GET(self):
                seen.append((self.path,self.headers.get('Cookie'),self.headers.get('Host')))
                content_type='text/html';status=200
                if self.path=='/robots.txt': body=expected;content_type='text/plain'
                elif self.path=='/sitemap.xml':
                    content_type='application/xml';body=f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{SITE}/</loc></url><url><loc>{SITE}/blog/old</loc></url><url><loc>{SITE}/blog/old</loc></url><url><loc>http://evil.test/api/</loc></url></urlset>'
                elif self.path=='/blog/old':
                    self.send_response(308);self.send_header('Location','http://127.0.0.1:1/private?token=x');self.end_headers();return
                elif self.path=='/blog/missing': body='missing';status=404
                else: body=f'<title>Example</title><meta name="description" content="Desc"><link rel="canonical" href="{SITE}{self.path}"><h1>Title</h1><img src="/a"><script type="application/ld+json">{{broken}}</script><a href="/blog/missing">missing</a><a href="/api/secret">private</a><a href="https://evil.test/blog/a">external</a>'
                self.send_response(status);self.send_header('Content-Type',content_type);self.end_headers();self.wfile.write(body.encode())
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try: report=run_audit(f'http://127.0.0.1:{server.server_port}',SITE,expected,['/','/blog','/privacy'])
        finally: server.shutdown();server.server_close();thread.join()
        self.assertTrue(report['robots']['matchesPolicy']);self.assertEqual(report['sitemap']['duplicates'],1);self.assertEqual(report['sitemap']['invalidUrls'],1)
        home=next(p for p in report['pages'] if p['path']=='/');self.assertIn('Images missing alt attributes',home['issues']);self.assertEqual(home['invalidSchemas'],1)
        old=next(p for p in report['pages'] if p['path']=='/blog/old');self.assertEqual(old['status'],308);self.assertNotIn('token',old['location'])
        self.assertEqual(next(p for p in report['links'] if p['path']=='/blog/missing')['status'],404)
        self.assertTrue(all(cookie is None and host=='studio.example.test' for _,cookie,host in seen));self.assertNotIn('/api/secret',[p for p,_,_ in seen]);self.assertNotIn('/private',[p for p,_,_ in seen])

    def test_partial_batch_and_noindex_diagnostic(self):
        from .site_audit import empty_response
        expected=render_robots(default_policy(),SITE)
        paths=['/','/blog','/privacy']+[f'/blog/post-{i:02d}' for i in range(15)]
        def measured(target,site,path):
            response=empty_response();response.update(status=200,ms=12)
            if path=='/robots.txt': response.update(body=expected,type='text/plain')
            elif path=='/sitemap.xml': response.update(type='application/xml',body='<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>{SITE}{p}</loc></url>' for p in paths)+'</urlset>')
            elif path=='/blog/post-00': return empty_response('Request failed')
            else: response.update(type='text/html',body=f'<title>Page</title><meta name="description" content="Desc"><link rel="canonical" href="{SITE}{path}"><h1>Page</h1><meta name="robots" content="noindex">')
            return response
        first=run_audit(SITE,SITE,expected,paths,fetcher=measured)
        self.assertEqual(first['totalPages'],18);self.assertEqual(len(first['pages']),12);self.assertEqual(first['nextOffset'],12)
        self.assertIn('Noindex URL listed in sitemap',first['pages'][0]['issues'])
        self.assertIsNone(next(p for p in first['pages'] if p['path']=='/blog/post-00')['noindex'])
        second=run_audit(SITE,SITE,expected,paths,offset=12,fetcher=measured)
        self.assertEqual(len(second['pages']),6);self.assertIsNone(second['nextOffset'])
        self.assertFalse({p['path'] for p in first['pages']} & {p['path'] for p in second['pages']})
