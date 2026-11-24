-- Execute as cedar_migrator after migrations. Runtime should not alter/delete audit records.
REVOKE UPDATE, DELETE ON accounts_securityevent FROM cedar_runtime;
REVOKE INSERT, UPDATE, DELETE ON django_migrations FROM cedar_runtime;

REVOKE UPDATE, DELETE ON inquiries_leadactivity FROM cedar_runtime;
