"""Pure domain pricing using integer arithmetic for USD rounding."""
import json
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name('pricing.json').read_text(encoding='utf-8'))
TYPES = {v['id']: v for v in CATALOG['projectTypes']}
GOALS = {v['id']: v for v in CATALOG['goals']}
FEATURES = {v['id']: v for v in CATALOG['options']}
STAGES = {v['id']: v for v in CATALOG['stages']}
RECOMMENDATIONS = {
    'launch': 'Start with the essential release, then iterate.',
    'design': 'Prioritize a distinct visual direction and accessible interaction.',
    'operations': 'Map the manual workflow before choosing automation.',
    'conversion': 'Define the customer journey and conversion goals.',
    'scale': 'Plan for maintainable architecture and future changes.',
}

def estimate(discovery):
    project, goal, stage = TYPES[discovery['type']], GOALS[discovery['goal']], STAGES[discovery['stage']]
    features = [item for item in FEATURES.values() if item['id'] in discovery['features'] and project['id'] in item['types']]
    base = project['base'] + sum(item['price'] for item in features)
    factor = int(round(stage['factor'] * 100))
    subtotal = (base * factor + 50) // 100
    multiplier = 18 if project['id'] == 'explore' else 13
    return {'low': subtotal // 50 * 50, 'high': (subtotal * multiplier + 499) // 500 * 50,
        'project': project['label'], 'goal': goal['label'], 'stage': stage['label'],
        'features': [item['label'] for item in features], 'recommendation': RECOMMENDATIONS[goal['id']]}
