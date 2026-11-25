"""Closed-list robots policy. Robots directives are voluntary, not access control."""
AGENTS = {
    'Googlebot': 'Search', 'bingbot': 'Search', 'OAI-SearchBot': 'AI search',
    'GPTBot': 'Model training', 'Claude-SearchBot': 'AI search', 'ClaudeBot': 'Model training',
    'Claude-User': 'User-triggered retrieval', 'PerplexityBot': 'AI search',
    'Google-Extended': 'Training / grounding outside Google Search',
}
CHOICES = ('inherit', 'allow', 'block')
PRIVATE = ('/workspace', '/login', '/api/', '/internal/')


def default_policy():
    return dict.fromkeys(AGENTS, 'inherit')


def valid_policy(value):
    return isinstance(value, dict) and set(value) == set(AGENTS) and all(isinstance(v, str) and v in CHOICES for v in value.values())


def render_robots(policy, site):
    if not valid_policy(policy):
        raise ValueError('Invalid crawler policy.')
    def group(agent, choice):
        if choice == 'block':
            return f'User-agent: {agent}\nDisallow: /'
        return '\n'.join([f'User-agent: {agent}', 'Allow: /', *(f'Disallow: {p}' for p in PRIVATE)])
    groups = [group('*', 'allow')]
    groups.extend(group(agent, policy[agent]) for agent in AGENTS if policy[agent] != 'inherit')
    return '\n\n'.join(groups) + '\n\nSitemap: ' + site.rstrip('/') + '/sitemap.xml\n'
