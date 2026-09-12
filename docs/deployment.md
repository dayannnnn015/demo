# Development deployment and operations

## Current development deployment

On 9 September 2026, a dedicated Supabase project `edunexus` was created in the existing account organization, in Singapore. Project reference: `eszhhtxzrplknrmzozwr`. Migrations `0001`–`0005` are committed successfully. Hosted role, TLS, date serialization, teacher visibility, version checks, imports, corrections, and audit behavior passed checks using synthetic fixtures that were rolled back.

A separate Vercel project `edunexus` is deployed under `joshs-projects-47d7b071` at **https://edunexus-balili.vercel.app**. Current deployment ID: `dpl_8ZvP2CdrjfuqzMLWAvV2nMMUEhVq` (Section 2B.1, API version 0.3.0, released 12 September 2026). The existing database, credentials, staff, and school setup are retained. The user previously approved the authentication settings and restricted credential transfer; those operations completed successfully.

GitHub, Supabase, and Vercel now use the project name `edunexus`. The private repository is https://github.com/bustamante-j/edunexus. The Vercel project ID and Supabase project reference are unchanged, preserving the existing database and accounts. The public address uses `edunexus-balili.vercel.app` because the shorter name is assigned to another project. The previous site address forwards to this one for existing bookmarks. API allowed origins and Supabase Auth callbacks use the new address.

The user designated `bjjoshuagarciab@gmail.com` for the first development administrator invitation. After deployment and browser verification, Supabase accepted the invitation for email delivery. The returned Auth identity was bootstrapped as `Development Administrator` with the `principal` permission level; this does not represent an appointment as the school's actual principal. The school profile is initialized without an invented school ID. No learner records or synthetic test fixtures remain. Inbox receipt, password setup, and actual user MFA enrollment are not yet verified.

Applied configuration:

1. Public/anonymous signup disabled, minimum password length 12, TOTP MFA enrollment/verification enabled, maximum three enrolled factors, and access-token lifetime 15 minutes. The public JWKS advertises ES256 signing.
2. Auth callback is `https://edunexus-balili.vercel.app/account/setup`; allowed redirects are that exact URL and `http://127.0.0.1:3001/account/setup`.
3. The seven runtime variables listed below are configured in **the production environment of the development Vercel project**. This is Vercel's stable deployment environment name; it is not the school's production rollout. Runtime MFA and verified database TLS are required.

The restricted database credential is held in ignored local files and Vercel's runtime environment. The privileged migration connection and Supabase service-role key stay local. Ignored `.local/configure-cloud.mjs` has run successfully; do not rerun completed setup or invitation scripts without checking existing state.

Live smoke checks passed: `/health/live` returned 200, readiness changed from 503 before bootstrap to 200 afterward, and `/api/v1/me` rejected an unauthenticated request with 401. `/account/setup`, `/account.js`, `/account/config`, and `/openapi.json` returned 200. The setup page's CSP and referrer policy were checked, and its configuration response exposed only the project URL and public key. Headless Edge verified the deployed page at 1280×900 and 390×844, with no uncaught JavaScript errors or mobile horizontal overflow. A mocked failed sign-in verified error display, password clearing, and button recovery; it does not replace a real MFA login.

Local validation now passes 59 tests, type checking, and the build. The runtime dependency audit reports no vulnerabilities. The remaining Section 1 hosted acceptance step is the invited user's password/MFA setup and successful authenticated `/api/v1/me` response. The setup page performs that API check after MFA verification and opens `School workspace` on success.

The subsequent usability update adds `/app` and forms for the existing Section 1 API. Browser tests passed both locally and against the deployed page, using intercepted synthetic Auth/API responses to exercise principal and teacher navigation, school edits, stale-version error retention, year/period/section creation, staff self-access controls, activity rendering, and sign-out cleanup. Desktop 1280×960 and mobile 390×844 were checked, with no uncaught errors, unexpected console errors, or horizontal page overflow. These frontend tests do not insert hosted records or replace real authenticated integration testing. Live backend smoke checks passed again after deployment, including readiness 200 and unauthenticated access rejection 401.

## Reproducing setup

Section 2B.1 adds [reviewed roster import and LRN correction](registry-review.md) through migration `0005`. A real Supabase rollback-only check exercised a 50-row preview with no staged learners, atomic commit, identical retry receipt, assigned-LRN correction/history, and teacher SQL boundaries. Synthetic Auth users, sections, learners, enrollments, review receipts, history, and the temporary operator role grant were rolled back. The hosted harness adapts postgres.js JSON parameter serialization to the API's pg interface; an initial harness mismatch was corrected before the successful run. These service/database checks do not replace a real MFA-authenticated HTTP workflow.

The Vercel release built successfully and live checks verified API version 0.3.0, database readiness 200, all six new contract operations, unauthenticated rejection 401, account setup/assets, CSP, and public configuration. An initial CLI authorization error resolved after verifying the existing login/project and retrying; no account or credential configuration changed. Section 1 frontend screens are retained; the new import and correction workflows are API-only.

Section 2A adds the learner registry and enrollment APIs described in [learner registry](learner-registry.md). Migration `0004` is additive; the existing database role, credentials, staff, and school setup are retained. Hosted verification checked real TLS and date parsing, anonymous learner isolation, manager enrollment commands, teacher boundaries, immutable movement history, stale-version rejection, and read-access audit. Its synthetic Auth users, school year, sections, learner, enrollment, events, and temporary operator role grant were all rolled back. After deployment, database readiness returned 200, the OpenAPI contract reported version 0.2.0, and all three new collection routes rejected unauthenticated requests with 401. Competing-write tests run against embedded PostgreSQL; these checks are not a full multi-session hosted API load test. The Section 1 frontend remains unchanged.

Create a dedicated Supabase project owned by the school or its designated operator. Configure asymmetric JWT signing (ES256 or RS256); this API rejects legacy HS256 tokens. Enable MFA and disable public/anonymous signup. Configure exact callback URLs, Auth rate limits, and reliable SMTP before school-wide invitations. Keep `edunexus` out of Data API exposed schemas. [Supabase production guidance](https://supabase.com/docs/guides/platform/going-into-prod).

Copy `.env.example` to ignored `.env`. Set `MIGRATION_DATABASE_URL` from the direct connection or session pooler (port 5432), using the database owner. Use `DATABASE_SSL=true` remotely. The connection string must contain no SSL query parameters; the application supplies certificate and hostname verification. The public Supabase Root 2021 CA is bundled for Supabase hostnames, with source and fingerprint in `src/core/supabase-ca.ts`. Its current expiry is April 2031; update it from the provider when rotated. [TLS guidance](https://supabase.com/docs/guides/platform/ssl-enforcement).

```powershell
rtk proxy npm.cmd ci --ignore-scripts
rtk proxy npm.cmd run check
rtk proxy npm.cmd run db:migrate
rtk proxy npm.cmd run db:credentials
```

The credential script writes `.local/runtime.env` exclusively and sets a generated password on `edunexus_app`. It refuses to overwrite an existing credential file. If it fails after writing the file, investigate before retrying: the file may contain a proposed password that was not applied. Deliberate rotation requires coordinating local/Vercel settings and verifying reconnection.

For local development, merge `DATABASE_URL` from `.local/runtime.env` into `.env`, or pass both environment files to Node. Local `ALLOWED_ORIGINS` must include `http://127.0.0.1:3001` for the setup page's module script and the frontend's local origin; deployed origins must be HTTPS. The current local-only override is in ignored `.local/dev.env`. For the shared pooler the runtime username is `edunexus_app.PROJECT_REF`, and port is 6543. The API uses unnamed parameterized queries and no named prepared statements. [Connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Vercel runtime environment

| Variable | Purpose | Secret |
|---|---|---|
| `DATABASE_URL` | Restricted `edunexus_app` transaction-pooler connection | Yes |
| `DATABASE_SSL` | Must be `true` | No |
| `SUPABASE_URL` | Project Auth base URL | No |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable or legacy anon key; never service-role | Public by design |
| `REQUIRE_MFA` | Must be `true` in deployed environments | No |
| `ALLOWED_ORIGINS` | Comma-separated exact HTTPS frontend origins | No |
| `LOG_LEVEL` | `info` by default | No |

Never upload `MIGRATION_DATABASE_URL`, the database owner password, bootstrap fields, local development secrets, or Supabase service-role keys. Vercel uses Express, Node 24, the repository root, `npm run build`, and Singapore `sin1` from `vercel.json`. `src/index.ts` is the sole Vercel application entrypoint. The app factory lives in `src/http-app.ts` so framework detection cannot select it accidentally. [Express deployment](https://vercel.com/docs/frameworks/backend/express).

After setting variables, deploy to the dedicated project:

```powershell
rtk proxy npm.cmd exec --yes --package=vercel -- vercel deploy --prod
```

Configure preview environments separately with development-only credentials and exact origins. Do not point preview builds at the school's real-data database. Configure edge abuse controls for anonymous traffic; the shared per-staff limiter applies after token verification. Keep migrations out of build hooks.

## Initial account and staff provisioning

Use Supabase Auth's administrative invitation workflow with a working callback URL. Never send a password in email. The managed service returns the user's UUID. Set `BOOTSTRAP_PRINCIPAL_ID` and `BOOTSTRAP_PRINCIPAL_NAME` locally, then run `npm run db:bootstrap`. The script requires an invited or confirmed, non-deleted, non-banned Auth identity and an empty staff registry. It creates the school profile with no invented school ID. Bootstrap fails safely if staff already exist.

After the user follows the invitation, `/account/setup` sets a password, enrolls TOTP if needed, and verifies a six-digit code. A successful `/api/v1/me` call confirms API access. Auth identity approval and staff activation are separate controls. For subsequent teachers, invite/create the identity first, then call `POST /api/v1/staff`. Use a managed recovery process for lost authenticators.

## Smoke checks and release discipline

Check `/health/live` for HTTP 200. `/health/ready` must return 503 before bootstrap and 200 afterward. It does not imply successful email delivery or MFA enrollment. Check `/account/setup`, `/account.js`, CSP, and public-key-only `/account/config`. `/api/v1/me` without a token must return 401; password-only tokens must return `MFA_REQUIRED`. A verified staff session must return its database role. Test a teacher against another section.

Run `npm run check` and regenerate `docs/openapi.json` before deployment. CI checks types, tests, build, contract freshness, and high-severity runtime dependency advisories. Add migrations instead of editing applied files. A Vercel code rollback does not reverse database migrations; use compatible schema changes and a rehearsed recovery procedure.

## School production rollout

This environment is for development. Before real learner data, the school needs ownership/recovery arrangements, approved hosting costs and availability, data handling responsibilities, restore-tested backups, and staff training. Plan settings affect pausing and backup availability; select them explicitly with the school. Database backups do not substitute for a separate recovery plan for future private document objects. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Record recovery-point and recovery-time objectives, restore into an isolated project, verify restored records and access policies, and test full workflows there. Do not describe the system as production-ready based only on unit tests, an API health check, or a successful build.
