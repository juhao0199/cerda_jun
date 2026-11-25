from unittest import TestCase
from .rich_content import normalize_document, safe_link
from .content import normalize, minutes


def doc(*nodes):
    return {'type': 'doc', 'content': list(nodes)}


def para(value, marks=None):
    return {'type': 'paragraph', 'content': [{'type': 'text', 'text': value, **({'marks': marks} if marks else {})}]}


class RichContentTests(TestCase):
    def test_text_marks_and_image_normalization(self):
        ref = 'upload:12345678-1234-1234-1234-123456789abc'
        source = doc(para(' text  ', [{'type': 'bold'}, {'type':'link','attrs':{'href':'https://example.com','target':'_blank','class':'anything'}}]),
                     {'type':'studioImage','attrs':{'ref':ref,'alt':'  Diagram  ','caption':'Caption'}})
        result, refs = normalize_document(source)
        self.assertEqual(refs, [ref])
        self.assertEqual(result['content'][0]['content'][0]['text'], ' text  ')
        self.assertEqual(result['content'][0]['content'][0]['marks'][1]['attrs'], {'href':'https://example.com'})
        self.assertEqual(result['content'][1]['attrs']['alt'], 'Diagram')
        self.assertEqual(normalize_document(result), (result, refs))

    def test_links_reject_script_and_protocol_relative(self):
        for url in ('javascript:alert(1)', 'data:text/html,x', '//example.com', '/\\example.com', 'https://user:password@example.com', 'https://example.com\n', 'http:/example.com'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                safe_link(url)
        for url in ('/blog/article', 'https://example.com/path', 'http://example.com'):
            self.assertEqual(safe_link(url), url)

    def test_invalid_structure_and_attributes(self):
        for item in ({'type':'script','text':'x'}, {'type':'paragraph','attrs':{'onclick':'x'}},
                     {'type':'heading','attrs':{'level':1}}, {'type':'studioImage','attrs':{'ref':'https://x.com/a.jpg','alt':'x','caption':''}},
                     para('text',[{'type':'link','attrs':{'href':'javascript:alert(1)'}}]),
                     para('text',[{'type':'bold','attrs':{'style':'bad'}}]), {'type':'table','content':[]}, {'type':'bulletList','content':[para('bad')]}):
            with self.subTest(item=item), self.assertRaises(ValueError):
                normalize_document(doc(item))
        with self.assertRaises(ValueError):
            normalize_document(doc(para('a'*80001)))
        with self.assertRaises(ValueError):
            normalize_document(doc(*[para('a') for _ in range(2001)]))

    def test_legacy_and_long_rich_articles(self):
        fields = {'title':'Title','summary':'Summary','category':'Web','tags':[], 'sections':[{'heading':'Intro','body':'Old text'}],'seoTitle':'','seoDescription':'','cover':''}
        self.assertEqual(normalize(fields),fields)
        rich = normalize({**fields,'sections':[],'document':doc(para('word '*6000))})
        self.assertEqual(minutes(rich),30)
        self.assertEqual(rich['sections'],[])
        with self.assertRaises(ValueError):
            normalize({**fields,'document':doc(para('x'))})

    def test_tables_and_nested_lists(self):
        cell = {'type':'tableCell','attrs':{'colspan':1,'rowspan':1,'colwidth':None},'content':[para('cell')]}
        table = {'type':'table','content':[{'type':'tableRow','content':[cell,cell]}]}
        items = {'type':'bulletList','content':[{'type':'listItem','content':[para('item')]}]}
        result, refs = normalize_document(doc(table,items,{'type':'codeBlock','attrs':{'language':'python'},'content':[{'type':'text','text':'  print(1)\n'}]}))
        self.assertEqual(result['content'][2]['content'][0]['text'],'  print(1)\n')
        self.assertEqual(refs,[])
        self.assertEqual(normalize_document(result),(result,refs))
