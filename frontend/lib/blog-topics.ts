const editorialTopics: Readonly<Record<string, readonly string[]>> = {
  'website-launch-checklist': ['Website launch', 'Quality assurance', 'Search indexing'],
  'crm-first-workflow': ['Lead management', 'Sales handoffs', 'Quotations'],
  'ai-knowledge-assistant-pilot': ['Knowledge assistants', 'Source permissions', 'AI evaluation'],
  'dashboard-metrics-for-small-business': ['Business dashboards', 'Metric definitions', 'Period comparisons'],
  'software-ownership-and-handover': ['Software ownership', 'Account access', 'Handover'],
  'process-automation-approval-checklist': ['Workflow automation', 'Human approvals', 'Safe retries'],
  'what-to-include-in-website-project-brief': ['Project scoping', 'Content planning', 'Acceptance criteria'],
  'website-performance-for-small-business': ['Page speed', 'Image optimization', 'Performance measurement'],
  'contact-form-delivery-setup': ['Contact forms', 'Email delivery', 'Reply-To'],
  'website-redesign-without-losing-search-traffic': ['Website redesign', 'URL redirects', 'SEO'],
  'business-website-budget': ['Website budgeting', 'Recurring costs', 'Launch scope'],
  'when-to-build-custom-software': ['Build vs. buy', 'Workflow design', 'Custom software'],
  'practical-ai-for-business': ['AI use cases', 'Pilot testing', 'Human review'],
};

const editorialRecommendations: Readonly<Record<string, readonly string[]>> = {
  'website-launch-checklist': ['contact-form-delivery-setup', 'website-performance-for-small-business', 'website-redesign-without-losing-search-traffic'],
  'crm-first-workflow': ['process-automation-approval-checklist', 'dashboard-metrics-for-small-business', 'when-to-build-custom-software'],
  'ai-knowledge-assistant-pilot': ['practical-ai-for-business', 'process-automation-approval-checklist', 'software-ownership-and-handover'],
  'dashboard-metrics-for-small-business': ['crm-first-workflow', 'when-to-build-custom-software', 'process-automation-approval-checklist'],
  'software-ownership-and-handover': ['when-to-build-custom-software', 'what-to-include-in-website-project-brief', 'website-launch-checklist'],
  'process-automation-approval-checklist': ['crm-first-workflow', 'ai-knowledge-assistant-pilot', 'software-ownership-and-handover'],
  'what-to-include-in-website-project-brief': ['business-website-budget', 'website-launch-checklist', 'software-ownership-and-handover'],
  'website-performance-for-small-business': ['website-launch-checklist', 'website-redesign-without-losing-search-traffic', 'what-to-include-in-website-project-brief'],
  'contact-form-delivery-setup': ['website-launch-checklist', 'crm-first-workflow', 'process-automation-approval-checklist'],
  'website-redesign-without-losing-search-traffic': ['website-launch-checklist', 'website-performance-for-small-business', 'what-to-include-in-website-project-brief'],
  'business-website-budget': ['what-to-include-in-website-project-brief', 'website-launch-checklist', 'when-to-build-custom-software'],
  'when-to-build-custom-software': ['software-ownership-and-handover', 'crm-first-workflow', 'business-website-budget'],
  'practical-ai-for-business': ['ai-knowledge-assistant-pilot', 'process-automation-approval-checklist', 'when-to-build-custom-software'],
};

type TopicSource = { slug: string; category: string; tags?: string[] };

export function topicsFor(post: TopicSource): string[] {
  const curated = Object.hasOwn(editorialTopics, post.slug) ? editorialTopics[post.slug] : [];
  const labels = [...(post.tags ?? []), ...curated];
  const unique = new Map<string, string>();
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed && !unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed);
  }
  return unique.size ? [...unique.values()] : [post.category];
}

export function relatedSlugsFor(slug: string, preferred: readonly string[] = []): string[] {
  const recommendations = Object.hasOwn(editorialRecommendations, slug) ? editorialRecommendations[slug] : [];
  return [...new Set([...preferred, ...recommendations])].filter(candidate => candidate !== slug);
}

export function rankRelatedPosts<T extends TopicSource>(post: TopicSource, candidates: readonly T[]): T[] {
  const topics = new Set(topicsFor(post).map(topic => topic.toLowerCase()));
  const category = post.category.trim().toLowerCase();
  return candidates
    .filter(candidate => candidate.slug !== post.slug)
    .map(candidate => ({
      candidate,
      sharedTopics: topicsFor(candidate).filter(topic => topics.has(topic.toLowerCase())).length,
      sameCategory: Number(candidate.category.trim().toLowerCase() === category),
    }))
    .filter(({ sharedTopics, sameCategory }) => sharedTopics > 0 || sameCategory > 0)
    .sort((a, b) => b.sharedTopics - a.sharedTopics || b.sameCategory - a.sameCategory)
    .map(({ candidate }) => candidate);
}
