from copy import deepcopy
from unittest import TestCase
from .website_rules import DEFAULTS, effective, normalize, public_fields, published_section_matches


class WebsiteRulesTests(TestCase):
    def test_defaults_and_private_keyword(self):
        fields = deepcopy(DEFAULTS)
        fields['focusKeyword'] = 'private planning'
        self.assertEqual(effective({}), normalize(DEFAULTS))
        self.assertNotIn('focusKeyword', public_fields(fields))

    def test_closed_schema(self):
        fields = deepcopy(DEFAULTS)
        fields['arbitraryScript'] = 'alert(1)'
        with self.assertRaises(ValueError): normalize(fields)
        fields = deepcopy(DEFAULTS)
        fields['copy']['heroIntro'] = 'x' * 481
        with self.assertRaises(ValueError): normalize(fields)
        fields = deepcopy(DEFAULTS)
        fields['homeNoindex'] = 1
        with self.assertRaises(ValueError): normalize(fields)

    def test_duplicate_questions_and_invalid_chars(self):
        fields = deepcopy(DEFAULTS)
        fields['guidance'][0]['question'] = fields['faq'][0]['question'].upper()
        with self.assertRaises(ValueError): normalize(fields)
        fields = deepcopy(DEFAULTS)
        fields['homeTitle'] = 'test\x00'
        with self.assertRaises(ValueError): normalize(fields)

    def test_published_section_match(self):
        fields = deepcopy(DEFAULTS)
        fields['copy']['aiIntro'] = 'Evidence grounded enterprise retrieval.'
        self.assertEqual(published_section_matches(fields, 'enterprise retrieval')[0]['anchor'], 'studio-knowledge')
        self.assertFalse(published_section_matches(DEFAULTS, 'enterprise retrieval'))
