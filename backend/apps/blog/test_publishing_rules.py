from datetime import datetime, timezone
from unittest import TestCase
from .publishing_rules import ACTIVE, TRANSITIONS, OWNER_ACTIONS, schedule_time


class PublishingRulesTests(TestCase):
    def test_timezone_normalization(self):
        now=datetime(2026,11,25,12,tzinfo=timezone.utc)
        self.assertEqual(schedule_time('2026-11-25T20:00:00+07:00',now),datetime(2026,11,25,13,tzinfo=timezone.utc))

    def test_invalid_times(self):
        now=datetime(2026,11,25,12,tzinfo=timezone.utc)
        for value in [None,'2026-11-25T20:00','2026-11-25T12:00:00Z','2028-01-01T00:00:00Z','bad']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                schedule_time(value,now)

    def test_gate(self):
        self.assertNotIn('publish',TRANSITIONS['review'])
        self.assertNotIn('publish',TRANSITIONS['stale'])
        self.assertIn('publish',TRANSITIONS['approved'])
        self.assertIn('publish',OWNER_ACTIONS)
        self.assertNotIn('published',ACTIVE)
