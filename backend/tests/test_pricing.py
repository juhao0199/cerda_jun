import json
from pathlib import Path
import unittest
from apps.inquiries.pricing import estimate

class PricingTests(unittest.TestCase):
    def test_all_frontend_configurations(self):
        fixtures = json.loads(Path(__file__).with_name('pricing-fixtures.json').read_text())
        self.assertGreater(len(fixtures), 1000)
        for case in fixtures:
            self.assertEqual(estimate(case['input']), case['expected'], case['input'])
