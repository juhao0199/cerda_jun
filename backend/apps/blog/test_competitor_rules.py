from unittest import TestCase
from .competitor_rules import domain, matched_sources, pair_stats, visible_text


class CompetitorRulesTests(TestCase):
    def test_hostname_boundary(self):
        self.assertEqual(domain('WWW.Example.org'),'example.org')
        for bad in ('cedarandcursor.com','x.cedarandcursor.com','https://example.org','example.org/path','127.0.0.1','example.org:443','x.local','a..org'):
            with self.subTest(bad=bad), self.assertRaises(ValueError): domain(bad)
        urls=[{'url':u} for u in ['https://www.example.org/a','https://example.org/b','https://example.org.other.com/','https://other.com/example.org','https://example.org@other.com/','https://example.org:444/','https://u@example.org/']]
        self.assertEqual(matched_sources('example.org',urls),['https://www.example.org/a','https://example.org/b'])

    def test_matched_denominator_and_gap_signals(self):
        rows=[('present','present','present',[]),('absent','present','absent',['url']),('present','absent','inconclusive',['url']),('inconclusive','present','absent',[]),('absent','absent','absent',[])]
        result=pair_stats(rows)
        self.assertEqual(result['paired'],5);self.assertEqual(result['comparable'],4)
        self.assertEqual(result['ownMentions'],2);self.assertEqual(result['competitorMentions'],2);self.assertEqual(result['ownShare'],50.0)
        self.assertEqual(result['citationGapSignals'],1);self.assertEqual(result['competitorSources'],2)
        self.assertIsNone(pair_stats([])['ownShare']);self.assertIsNone(pair_stats([('absent','absent','absent',[])])['ownShare'])

    def test_visible_text_does_not_include_metadata(self):
        f={'title':'Title','summary':'Summary','seoTitle':'SECRET','document':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'AI workflow','marks':[{'attrs':{'href':'secret'}}]}]}]}}
        self.assertEqual(visible_text(f),'title summary ai workflow')
        self.assertEqual(visible_text({'title':'Title','sections':[{'heading':'AI','body':'Workflow'}]}),'title ai workflow')
