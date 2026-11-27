"""Closed, plain-text website content schema. No arbitrary HTML, URLs or JSON-LD."""
import json
from pathlib import Path

DEFAULTS = json.loads(Path(__file__).with_name('website_defaults.json').read_text(encoding='utf-8'))


def clean(value, limit, required=True):
    if not isinstance(value, str):
        raise ValueError('Expected plain text.')
    value = value.strip()
    if (required and not value) or len(value) > limit or any(ord(c) < 32 or 0xd800 <= ord(c) <= 0xdfff for c in value):
        raise ValueError('Invalid text length or characters.')
    return value


def normalize(fields):
    if not isinstance(fields, dict) or set(fields) != set(DEFAULTS):
        raise ValueError('Invalid website fields.')
    result = {}
    for key in ('homeTitle', 'blogTitle', 'homeDescription', 'blogDescription', 'focusKeyword'):
        result[key] = clean(fields[key], 100 if key.endswith('Title') or key == 'focusKeyword' else 320, key != 'focusKeyword')
    for key in ('homeNoindex', 'blogNoindex', 'faqSchema', 'serviceSchema'):
        if type(fields[key]) is not bool:
            raise ValueError('Expected a boolean preference.')
        result[key] = fields[key]
    copy = fields['copy']
    if not isinstance(copy, dict) or set(copy) != set(DEFAULTS['copy']):
        raise ValueError('Invalid section fields.')
    result['copy'] = {key: clean(copy[key], 100 if key.endswith('Heading') else 480) for key in DEFAULTS['copy']}
    for key in ('faq', 'guidance'):
        rows = fields[key]
        if not isinstance(rows, list) or not 1 <= len(rows) <= 12:
            raise ValueError('Use 1–12 question and answer pairs per section.')
        result[key] = []
        for row in rows:
            if not isinstance(row, dict) or set(row) != {'question', 'answer'}:
                raise ValueError('Invalid question and answer pair.')
            result[key].append({'question': clean(row['question'], 160), 'answer': clean(row['answer'], 800)})
    all_questions = [r['question'].casefold() for key in ('faq', 'guidance') for r in result[key]]
    if len(set(all_questions)) != len(all_questions):
        raise ValueError('Questions must be unique across both sections.')
    return result


def effective(snapshot):
    return normalize(snapshot or DEFAULTS)


def public_fields(snapshot):
    fields = effective(snapshot)
    # Internal planning keyword never leaves the protected API.
    return {k: v for k, v in fields.items() if k != 'focusKeyword'}


SECTION_INDEX = (
    ('home', 'Homepage', ('heroIntro',)),
    ('services', 'Services', ('servicesHeading', 'servicesIntro')),
    ('studio-solutions', 'Solutions', ('solutionsIntro',)),
    ('studio-web', 'Web experiences', ('webHeading', 'webIntro')),
    ('studio-operations', 'Business software', ('softwareHeading', 'softwareIntro')),
    ('studio-knowledge', 'AI systems', ('aiHeading', 'aiIntro')),
    ('studio-workflows', 'Automation', ('automationHeading', 'automationIntro')),
    ('studio-applications', 'Industries and engineering', ('industriesHeading', 'industriesIntro', 'engineeringHeading', 'engineeringIntro')),
    ('process', 'Process', ('processHeading', 'processIntro')),
    ('insights', 'Insights', ('insightsHeading', 'insightsIntro')),
    ('about', 'About', ('aboutHeading', 'aboutIntro')),
    ('faq', 'FAQ and guidance', ('faqHeading', 'faqIntro', 'guidanceHeading', 'guidanceIntro')),
)

def published_section_matches(fields, phrase):
    result = []
    for anchor, label, keys in SECTION_INDEX:
        values = [fields['copy'][key] for key in keys]
        if anchor == 'faq':
            values.extend(q['question'] + ' ' + q['answer'] for name in ('faq', 'guidance') for q in fields[name])
        haystack = ' '.join(' '.join([label, *values]).casefold().split())
        if phrase in haystack:
            title = label + ' — ' + values[0]
            result.append({'anchor': anchor, 'title': title})
    return result
