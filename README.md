# Cedar & Cursor V1.7 — Authentication & Authorization

Next.js 16 + Django 5.2 / DRF + independent PostgreSQL 17. Existing marketing pages, estimator, inquiry API and content retained. New `/login` and `/workspace`; operator-provisioned roles and mandatory TOTP. No Supabase, no public signup. Read `docs/SECURITY.md` before deployment.

## Local development (Mac / Docker Desktop)

1. `cp .env.example .env` and `cp frontend/.env.example frontend/.env.local`.
2. Generate two separate `openssl rand -hex 32` values for `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`. Generate a third independent key using `python3 -c 'import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'` for `CEDAR_MFA_KEY`. Edit `.env` locally. Do not commit secrets. Keep `DJANGO_DEBUG=1`, `SITE_ORIGIN=http://localhost:3000`, `CEDAR_TRUST_EDGE=0` for local use.
3. `docker compose up -d --build --wait db backend`
4. `docker compose exec backend python manage.py migrate`
5. `docker compose exec backend python manage.py provision_account owner --role owner` — private interactive terminal; create password, enroll authenticator using displayed seed, verify code. Wait for a new code before login. Do not use `createsuperuser` (legacy admin is disabled).
6. `cd frontend && npm install && npm run dev`.
7. Open http://localhost:3000/login (use localhost exactly; origin checking is intentional). Workspace at `/workspace`. No direct browser calls to port 8000.

Existing V1.6.1 Django databases: back up first, reuse the existing PostgreSQL volume/connection and run `migrate`; this is an additive migration. Existing Django users have no security profile and cannot sign in until provisioned with `--reset` and a role. Never run `docker compose down -v` if retaining data. Legacy V1.6 raw-SQL import is retained in the inquiries app; consult the previous migration documentation and test a copy before use.

## Account operations

```sh
docker compose exec backend python manage.py provision_account staff1 --role staff
docker compose exec backend python manage.py provision_account client1 --role client
docker compose exec backend python manage.py account_access staff1 revoke
docker compose exec backend python manage.py account_access staff1 role --role client
docker compose exec backend python manage.py account_access staff1 disable
docker compose exec backend python manage.py provision_account staff1 --role staff --reset
docker compose exec backend python manage.py security_cleanup
```

Recovery is operator-mediated, after out-of-band identity verification. `--reset` changes password and TOTP, enables the account and invalidates sessions. The command grants exactly the specified role; do not run it from a shared or recorded terminal. Owner can see inquiry and security-event summaries, staff can see inquiry summaries, client can only manage their own session/password. This release does not yet implement customer project tenancy or full CRM.

## Production template (not a deployed system)

`compose.prod.yaml` is separate from development. Use a fresh database volume or manually migrate/transfer existing data with verified backups. The init roles script runs only on a fresh volume. Configure `.env.production` from `.env.production.example` with independent long passwords, Django and MFA keys, and real HTTPS hostname. Replace all `studio.example.com` in `infrastructure/nginx/site.conf`, install valid certificate files at `infrastructure/nginx/certs/fullchain.pem` and `privkey.pem`, restrict permissions. Keep host firewall limited to SSH from trusted addresses plus 80/443. Do not publish DB/backend ports or put a CDN in front without reviewing real-IP trust. This sample uses an isolated single-host database network; remote DB requires verified TLS.

```sh
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
docker compose --env-file .env.production -f compose.prod.yaml exec backend python manage.py check --deploy
docker compose --env-file .env.production -f compose.prod.yaml exec backend python manage.py provision_account owner --role owner
```

The production migration service runs migrations and revokes runtime audit update/delete permissions. Verify grants after every migration. Configure certificate renewal/reload, backups, off-host audit logging, and daily `security_cleanup`. Pin dependencies and images after verified installation and scan them before release. The template is not a substitute for a security audit.

## Verification

```sh
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec backend python manage.py test
cd frontend
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

For browser E2E existing estimator export tests, build with `NEXT_PUBLIC_INQUIRY_MODE=local`; live integration needs backend running and `live` mode. Backend tests require PostgreSQL and a test role that can create a temporary test database (development only). Production runtime is intentionally not granted that permission. `docs/auth.openapi.yaml` documents browser auth API; `docs/SECURITY.md` contains security assumptions and release gates. See `docs/VERIFICATION.md` for checks actually executed in the authoring environment.
