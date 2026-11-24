from django.db import migrations
from django.utils import timezone


POSTS = [{'slug': 'business-website-budget',
  'title': 'What should you budget for a business website?',
  'category': 'Web',
  'summary': 'A practical way to separate the essentials from the features that can wait.',
  'minutes': 3,
  'sections': [{'heading': 'Start with the job the website needs to do',
                'body': 'A business website should answer the questions your customers actually ask. A '
                        'restaurant needs menus, opening information and a clear way to book or contact the '
                        'team. A service business may need a description of its work, credible examples and '
                        'a way to request a quote. Start there before selecting a technology stack.'},
               {'heading': 'Separate the initial build from ongoing costs',
                'body': 'The initial build covers the agreed pages, interface and development. Recurring '
                        'costs may include hosting, a domain, email, software subscriptions and maintenance. '
                        'Ask which of these are included in the quote and who controls the accounts. Content '
                        'writing and translations also need a clearly defined owner.'},
               {'heading': 'Plan an achievable first release',
                'body': 'A small, well-tested site with useful content can be more effective than a larger '
                        'site with unfinished features. Identify what must be present at launch, what can be '
                        'added later and what success looks like. Our guided estimator is a planning aid, '
                        'not a binding price.'}]},
 {'slug': 'when-to-build-custom-software',
  'title': 'When does a business need custom software?',
  'category': 'Software',
  'summary': 'How to spot the point where spreadsheets and disconnected tools stop being enough.',
  'minutes': 3,
  'sections': [{'heading': 'Look for recurring friction',
                'body': 'Repeated manual copying, inconsistent records and unclear access permissions can '
                        'signal a workflow problem. Record the steps and the people involved before deciding '
                        'to replace the tools. Measure the time spent on the process and the cost of '
                        'mistakes where possible.'},
               {'heading': 'Compare building with buying',
                'body': 'An existing product may solve the problem more cheaply and with less maintenance. '
                        'Custom development makes more sense when the workflow is distinctive, the '
                        'integrations are essential or a product cannot support the required access '
                        'controls. Consider migration and ongoing ownership, not just the first build.'},
               {'heading': 'Start with one workflow',
                'body': 'Choose a bounded process and define its acceptance criteria. Keep data access, '
                        'backups and auditability in the design from the beginning. Review a working '
                        'prototype with the people who will use it before expanding the scope.'}]},
 {'slug': 'practical-ai-for-business',
  'title': 'Where AI actually helps a small business',
  'category': 'AI',
  'summary': 'Choose useful, measurable workflows before adding an AI assistant to everything.',
  'minutes': 3,
  'sections': [{'heading': 'Choose the right problem',
                'body': 'A knowledge assistant can help staff find information in existing policies or '
                        'documentation. An automation can help organize routine requests. Neither needs to '
                        'replace human judgment. Start with a task where the input, expected output and '
                        'review process are clear.'},
               {'heading': 'Build in boundaries',
                'body': 'Decide which information may be used, who can access it and what should never leave '
                        'your systems. AI-generated answers can be incorrect, so provide sources where '
                        'available and allow people to escalate uncertain requests. Test the system with '
                        'realistic examples before relying on it.'},
               {'heading': 'Evaluate before expanding',
                'body': 'Compare the new workflow against your current process using relevant measures such '
                        'as time saved, correction rates and user satisfaction. Include the cost of running '
                        'and maintaining the system. Expand only where the results justify it.'}]}]


def seed(apps, schema_editor):
    Post = apps.get_model("blog", "Post")
    Revision = apps.get_model("blog", "Revision")
    imported_at = timezone.now()
    for item in POSTS:
        fields = {k: item[k] for k in ("title", "summary", "category", "sections")}
        fields.update(tags=[], seoTitle="", seoDescription="", cover="")
        post, created = Post.objects.get_or_create(slug=item["slug"], defaults={"draft": fields, "published": fields, "status": "published", "published_at": imported_at})
        if created:
            Revision.objects.create(post=post, version=1, status="published", action="import", snapshot=fields)


class Migration(migrations.Migration):
    dependencies = [("blog", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
