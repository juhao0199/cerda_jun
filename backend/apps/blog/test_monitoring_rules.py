import unittest
from datetime import datetime, timezone, timedelta
from .monitoring_rules import prompt_key, sources, observed_time


class MonitoringRuleTests(unittest.TestCase):
    def test_duplicate_prompt_context(self):
        self.assertEqual(prompt_key('  AI   Tools ', 'English', 'Thailand', ['a','b']),prompt_key('ai tools','english','thailand',['b','a']))
        self.assertNotEqual(prompt_key('AI Tools','English','Thailand',['a']),prompt_key('AI Tools','English','Myanmar',['a']))

    def test_citation_host_boundary(self):
        items=sources('https://cedarandcursor.com/blog/ai\nhttps://cedarandcursor.com.example.org/', 'present')
        self.assertEqual([r['owned'] for r in items],[True,False])
        for url in ['https://cedarandcursor.com.example.org/', 'https://evil.test/?cedarandcursor.com', 'https://evil.test/cedarandcursor.com']:
            with self.assertRaises(ValueError): sources(url,'present')
        with self.assertRaises(ValueError): sources('https://www.cedarandcursor.com/','absent')
        self.assertEqual(sources('','inconclusive'),[])

    def test_untrusted_source_syntax_and_limit(self):
        for url in ('javascript:alert(1)','http://example.org','https://user:pass@example.org','https://example.org:8080','https://example.org\\foo','https://example.org/x y','https://example.org\nhttps://example.org'):
            with self.assertRaises(ValueError): sources(url,'inconclusive')
        with self.assertRaises(ValueError): sources('\n'.join(f'https://example.org/{i}' for i in range(9)),'inconclusive')

    def test_time_requires_offset(self):
        now=datetime(2026,11,25,10,tzinfo=timezone.utc)
        self.assertEqual(observed_time('2026-11-25T17:00:00+07:00',now),now)
        for dt in ('2026-11-25T10:00:00','not a date',(now+timedelta(hours=1)).isoformat()):
            with self.assertRaises(ValueError): observed_time(dt,now)
