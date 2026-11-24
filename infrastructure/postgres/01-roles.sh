#!/bin/sh
set -eu
# Only runs on a fresh PostgreSQL data volume. psql variables are quoted as literals.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrator_password="$CEDAR_MIGRATOR_PASSWORD" -v runtime_password="$CEDAR_RUNTIME_PASSWORD" <<'SQL'
CREATE ROLE cedar_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE cedar_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE ALL ON DATABASE cedar_cursor FROM PUBLIC;
GRANT CONNECT ON DATABASE cedar_cursor TO cedar_migrator, cedar_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO cedar_migrator;
GRANT USAGE ON SCHEMA public TO cedar_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE cedar_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cedar_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE cedar_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cedar_runtime;
SQL
