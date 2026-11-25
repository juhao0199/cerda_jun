-- Execute as cedar_migrator after migrations. Runtime should not alter/delete audit records.
REVOKE UPDATE, DELETE ON accounts_securityevent FROM cedar_runtime;
REVOKE INSERT, UPDATE, DELETE ON django_migrations FROM cedar_runtime;

REVOKE UPDATE, DELETE ON inquiries_leadactivity FROM cedar_runtime;

REVOKE UPDATE, DELETE ON quotations_revision FROM cedar_runtime;
REVOKE DELETE ON quotations_quotation FROM cedar_runtime;

REVOKE UPDATE, DELETE ON blog_revision FROM cedar_runtime;
REVOKE DELETE ON blog_post FROM cedar_runtime;

-- Metadata changes and reference-checked deletes only; image bytes stay immutable.
REVOKE UPDATE ON blog_coverimage FROM cedar_runtime;
GRANT UPDATE (filename, alt, caption, version) ON blog_coverimage TO cedar_runtime;
GRANT DELETE ON blog_coverimage TO cedar_runtime;
-- PostgreSQL SELECT FOR UPDATE requires UPDATE privilege on at least one column.

-- Editorial names and URL aliases remain reserved; no hard deletion or alias rewrite.
REVOKE DELETE ON blog_editorialterm FROM cedar_runtime;
REVOKE UPDATE, DELETE ON blog_slugalias FROM cedar_runtime;

-- Human observations are append-only.
REVOKE UPDATE, DELETE ON blog_discoveryobservation FROM cedar_runtime;

-- Append-only technical reports and singleton crawler policy.
REVOKE UPDATE, DELETE ON blog_siteaudit FROM cedar_runtime;
REVOKE INSERT, DELETE ON blog_crawlerpolicy FROM cedar_runtime;

-- Prompt definitions are retained and observation evidence is append-only.
REVOKE DELETE ON blog_trackedprompt FROM cedar_runtime;
REVOKE UPDATE, DELETE ON blog_promptmeasurement FROM cedar_runtime;
