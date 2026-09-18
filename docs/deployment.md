# Development deployment and operations

## Current development deployment

On 9 September 2026, a dedicated Supabase project `edunexus` was created in the existing account organization, in Singapore. Project reference: `eszhhtxzrplknrmzozwr`. Migrations `0001`–`0017` are committed successfully. Hosted role, TLS, date serialization, teacher visibility, version checks, imports, LRN/timeline/grade-placement corrections, identity links/reversal, enrollment void/restoration, daily/monthly attendance and audit behavior passed checks using synthetic fixtures that were rolled back.

A separate Vercel project `edunexus` is deployed under `joshs-projects-47d7b071` at **https://edunexus-balili.vercel.app**. Current deployment ID: `dpl_CRBGW1XGH9FvQ1n4eAhEyhjJ2rK9` (Section 4A.3, API version 0.15.0, September 2026 release). The existing database, credentials, staff, and school setup are retained. The user previously approved the authentication settings and restricted credential transfer; those operations completed successfully.

GitHub, Supabase, and Vercel now use the project name `edunexus`. The private repository is https://github.com/bustamante-j/edunexus. The Vercel project ID and Supabase project reference are unchanged, preserving the existing database and accounts. The public address uses `edunexus-balili.vercel.app` because the shorter name is assigned to another project. The previous site address forwards to this one for existing bookmarks. API allowed origins and Supabase Auth callbacks use the new address.

The user designated `bjjoshuagarciab@gmail.com` for the first development administrator invitation. After deployment and browser verification, Supabase accepted the invitation for email delivery. The returned Auth identity was bootstrapped as `Development Administrator` with the `principal` permission level; this does not represent an appointment as the school's actual principal. The school profile is initialized without an invented school ID. No learner records or synthetic test fixtures remain. Inbox receipt and password setup are not yet verified.

Applied configuration:

1. Public/anonymous signup disabled, minimum password length 12, and access-token lifetime 15 minutes. The public JWKS advertises ES256 signing.
2. Auth callback is `https://edunexus-balili.vercel.app/account/setup`; allowed redirects are that exact URL and `http://127.0.0.1:3001/account/setup`.
3. The seven runtime variables listed below are configured in **the production environment of the development Vercel project**. This is Vercel's stable deployment environment name; it is not the school's production rollout. Verified database TLS is required.

The restricted database credential is held in ignored local files and Vercel's runtime environment. The privileged migration connection and Supabase service-role key stay local. Ignored `.local/configure-cloud.mjs` has run successfully; do not rerun completed setup or invitation scripts without checking existing state.

Live smoke checks passed: `/health/live` returned 200, readiness changed from 503 before bootstrap to 200 afterward, and `/api/v1/me` rejected an unauthenticated request with 401. `/account/setup`, `/account.js`, `/account/config`, and `/openapi.json` returned 200. The setup page's CSP and referrer policy were checked, and its configuration response exposed only the project URL and public key. Headless Edge verified the deployed page at 1280×900 and 390×844, with no uncaught JavaScript errors or mobile horizontal overflow. A mocked failed sign-in verified error display, password clearing, and button recovery; it does not replace a real sign-in.

Local validation now passes 232 tests, type checking, and the build. No runtime dependencies were added in Section 4A.3; the runtime dependency audit reported no vulnerabilities. The remaining Section 1 hosted acceptance step is the invited user's password setup and successful authenticated `/api/v1/me` response. The setup page performs that API check once the password is set and opens `School workspace` on success.

The subsequent usability update adds `/app` and forms for the existing Section 1 API. Browser tests passed both locally and against the deployed page, using intercepted synthetic Auth/API responses to exercise principal and teacher navigation, school edits, stale-version error retention, year/period/section creation, staff self-access controls, activity rendering, and sign-out cleanup. Desktop 1280×960 and mobile 390×844 were checked, with no uncaught errors, unexpected console errors, or horizontal page overflow. These frontend tests do not insert hosted records or replace real authenticated integration testing. Live backend smoke checks passed again after deployment, including readiness 200 and unauthenticated access rejection 401.

## Reproducing setup

Section 4A.3 adds [assessment-policy drafts](assessment-policy-drafts.md) through migration `0017`, committed successfully to Supabase. All 232 local tests, type checks and build passed, including 10 draft-specific tests. The runtime dependency audit reported no vulnerabilities. Drafts retain explicit Grades 1–6 applicability, source references and exact component proportions; they cannot be approved, assigned to offerings or used to compute grades. No official weights or school data are seeded.

Focused hosted checks passed restricted-role/TLS access, canonical metadata and response contracts, officer revision, archival/history, stale/no-op denial, database validation of malformed weights and unsupported grade/status values, manager-only access, direct-write and private-helper denial. Every synthetic staff identity, draft, journal/audit record and temporary operator role grant was rolled back. These tests do not replace current-policy verification, real staff authenticated HTTP, concurrent API load or school acceptance.

The 0.15.0 Vercel release is ready. Live checks passed version/stage, readiness, all five protected draft endpoints, explicit weight/source contracts, absence of an approval endpoint, and existing account setup/assets/configuration. No frontend screens were added. Preserve draft roots and journals on application rollback; operational adoption, immutable policy binding and calculation rules remain subsequent work.


Sections 4A.1 and 4A.2 add the [subject catalog](subject-catalog.md) and [section offerings](section-subjects.md) through migrations `0015` and `0016`, committed successfully to Supabase. They were developed as separate increments and deployed together in release 0.14.0. All 222 local tests, type checks and build passed, including 7 catalog and 11 offering cases; the runtime dependency audit found no vulnerabilities. No official subject list, grading formula or automatic attendance-alert rule is seeded.

Focused hosted checks passed restricted-role/TLS access, response contracts, catalog history, pinned selection and explicit draft refresh, current-adviser isolation, direct-write/private-helper denial, stale catalog/offering versions, archival/reactivation and closed-year guards. The harness enforced runtime statement/lock timeouts and rolled back every synthetic identity, school year, subject, offering, history record and temporary operator role grant. This does not replace real staff authenticated HTTP, school curriculum acceptance or concurrent API load testing.

The 0.14.0 Vercel release is ready. Live checks passed version/stage, database readiness, all ten protected catalog/offering operations, snapshot/refresh contracts and existing account setup/assets/configuration. These increments are API-only. Preserve both catalog and offering journals and pinned metadata on application rollback. Score entry and finalization must integrate explicit dependency protection before grading is implemented.


Section 3B.4 adds [manual attendance follow-up](attendance-followups.md) through migration `0014`, committed successfully to Supabase. All 204 local tests, type checks and build passed, including 19 new case-workflow tests; the runtime dependency audit found no vulnerabilities. The user confirmed that the school has no approved automatic-alert rule. No thresholds, automatic case creation or messages are enabled.

Hosted verification passed reviewed case opening, duplicate/stale denial, opening/current evidence comparison, manager-only access, direct-write/private-helper denial, update/resolve/cancel/reopen, closed-year resolution and filtered queue/history contracts. The 100-member monitor and monthly state/dependency regression also passed. Runtime statement/lock timeouts were enforced; all synthetic identities, learners, year/sections, schedules, attendance, cases/events, snapshots and the temporary operator role grant were rolled back. This is service/database verification and does not establish real staff authenticated HTTP or full concurrent load.

Case opening evidence and journals must be retained on application rollback. Existing cases can remain assigned to suspended managerial staff; an active manager must explicitly review reassignment. Existing case actions remain available after year closure and source correction, while new cases require an active year. School operational procedures and retention approval remain outstanding.

The 0.12.0 Vercel release is ready. Live checks passed version/stage, database readiness, all seven protected managerial follow-up operations, opening/current evidence and due-state contracts, existing monitor/monthly routes, daily context, and account setup/assets/configuration. Cases remain API-only; automatic alerts and messaging are not enabled.


Section 3B.3 adds [classroom absence monitoring](attendance-monitor.md) through migration `0013`, committed successfully to Supabase. The read-only endpoint returns filtered, scoped evidence and within-window observations; no school alert policy, official credits, case records or messages are created. All 185 local tests, type checks and build passed, including 18 new monitoring cases. The runtime dependency audit found no vulnerabilities.

Hosted checks passed 100 learners across 31 dates, incomplete and absence filters before pagination, raw partial-day absences, missing/unconfigured evidence, frozen-month context and teacher isolation. The monthly submit/lock/reopen/return and dependency regression also passed. Runtime statement/lock timeouts were enforced; all synthetic identities, learners, year/sections, schedules, marks, snapshots and the temporary role grant were rolled back. This remains service/database verification, not real staff authenticated HTTP or full concurrent load.

The 0.11.0 Vercel release is ready. Live checks passed version/stage, readiness, monitoring authentication rejection and its input/evidence contracts, all six existing monthly routes, daily month context, and account setup/assets/configuration. No frontend screens were added. The extension creates no new domain tables; retain the existing monthly migration/guards on application rollback.


Section 3B.2 adds [monthly attendance review](monthly-attendance.md) through migration `0012`, committed successfully to the development database. Hosted verification passed restricted-role/TLS access, 100 members across 30 dates, missing-mark readiness, submit/lock/reopen/resubmit/return, frozen snapshot pagination and name preservation, teacher status-only access, direct-write/private-helper denial, daily/calendar/identity freeze, deferred backdated enrollment rejection, and protected history. The harness enforced runtime statement/lock timeouts and explicitly forced deferred constraints. All synthetic identities, learners, year/sections, calendars, attendance, snapshots, journals and its temporary operator role grant were rolled back. These checks do not replace real staff authenticated HTTP or realistic concurrent load.

The 18 new local monthly cases cover workflow/version races, complete membership and unknowns, calendar/enrollment/identity dependencies, snapshot history and pagination, transaction rollback, leap/partial months, the Manila date boundary and the 1,000-member processing limit. Low Windows memory initially prevented database initialization. A later oversized fixture timeout was resolved by explicitly refreshing embedded-database planner statistics before bulk enrollment; guards and test timeouts were retained. The complete 167-test suite then passed.

Monthly counts are raw classroom sessions, not official attendance credits. Alternative-delivery conversion and official forms remain unimplemented. Submitted and locked months both freeze affected data; year closure remains independent and prevents later monthly transitions. Preserve `0012`, its snapshots and dependency guards during application rollback; use a compatible release once submissions exist.

The 0.10.0 Vercel release is ready. Live checks passed version/stage, database readiness, all six protected monthly routes, transition and member-page contracts, status privacy, daily month context, and existing account setup/assets/configuration. This increment is API-only; no monthly screens or real school attendance records were added.

Section 3B.1 adds [reviewed classroom attendance](daily-attendance.md) through migration `0011`. Hosted verification passed restricted-role/TLS access, a 100-learner teacher sheet/preview/commit, unknown marks, current-access isolation, stale/private-helper/direct-write denial, blocked calendar changes, deferred enrollment-timeline rejection, reviewed clearing and protected history. The harness explicitly forced deferred constraints while checking the expected rejection. Synthetic users, 100 learners, sections, the active fixture year, calendars, marks, journals and the temporary operator role grant were rolled back. Tests used runtime statement/lock timeouts. They do not replace real staff authenticated HTTP or multi-session load testing.

The 0.9.0 Vercel release is ready. Live checks passed version/stage, readiness, all four protected attendance routes, the 100-row/full-session-pair contract, teacher historical-scope labels, and existing account/calendar/placement endpoints. Classroom attendance is API-only; no real marks were inserted. ADM conversion, official totals, monthly review/submission/locking and school acceptance remain pending. Preserve attendance history and dependency guards on rollback: a compatible release must retain these rules once marks exist.

Section 3A adds [reviewed instructional calendars](instructional-calendar.md) through migration `0010`. Hosted checks passed restricted-role/TLS access, unconfigured reads without calendar creation, a 62-date preview/commit, session-mode summaries, assigned-section visibility, blocked school changes with overrides, reviewed override clearing and baseline suspension/alternative-delivery changes, stale rejection, private-helper/direct-write denial, history and access logs. All synthetic users, years, sections, calendar rows, journals and the temporary operator role grant were rolled back. Checks used the runtime statement/lock timeouts and an adapter for the operator driver; they do not replace real authenticated HTTP testing or multi-session load.

The 0.8.0 Vercel release is ready. Live checks passed stage/version, database readiness, all four protected calendar operations, bounded review inputs, effective source/session contracts, and existing account setup/assets/configuration. This module is API-only. No official calendar dates or learner attendance marks were inserted. Preserve calendar history on rollback; a compatible application is needed to present configured schedules. Attendance marking and finalized-period protections remain the next work, with school-approved arithmetic still required for official totals.

Section 2B.5 adds [whole-year grade-placement review](grade-placement.md) through migration `0009`. Hosted checks passed preview, correction, unchanged original movement history, grade/section projection, teacher access changes, private-helper denial, stale rejection, subsequent movement/timeline correction, and a reviewed placement reversal. The existing correction journal now records revision kind and old/new grades; earlier timeline rows retain null grade metadata. All synthetic users, records, history, and the temporary operator role grant were rolled back. Checks used the runtime statement/lock timeouts and the operator harness's JSON/date adapter; they do not establish real authenticated HTTP workflows or multi-session load.

The 0.7.0 Vercel release is ready. Live checks passed version/stage, database readiness, three protected placement routes, grade/year context, shared correction-kind/grade contracts, and existing account setup/assets/configuration. The workflow is API-only. Use a compatible release for rollback after placement corrections exist; preserve both correction kinds and use the effective timeline. Future attendance, academic finalization, and released forms still need explicit integration with placement corrections.

Section 2B.4 adds [reviewed annual enrollment void/restoration](enrollment-records.md) through migration `0008`. Hosted service/database checks passed preview without mutation, void/restoration, original movement preservation, default roster exclusion, reporting-eligibility flags, teacher isolation, direct-write denial, stale review rejection, and identity linking after a duplicate void with conflicting restoration blocked. The harness used the runtime statement/lock timeouts and adapted postgres.js JSON/date representations. All synthetic identities, staff, school records, history, and its temporary operator role grant were rolled back. This remains service/database coverage, not a real authenticated HTTP or multi-session load test.

The 0.6.0 Vercel release is ready. Live checks passed all three protected record-review operations, API version/stage, readiness, validity filters and timeline/history reporting flags, plus existing account setup/assets/configuration. No learner or record-review screens were added. After voided records exist, code predating 0.6.0 would treat them incorrectly; use a compatible release for rollback, preserving review history and the valid-record uniqueness rules.

Section 2B.3 adds [reviewed learner identity links and reversal](learner-identity.md) through additive migration `0007`. Hosted service/database checks passed preview, confirmation, original enrollment/event preservation, retained roster mapping, teacher isolation, read-only linked profiles, annual-enrollment conflict guards, stale-review rejection, timeline correction on a linked profile, and reversal preserving that correction. The harness used the runtime's statement/lock timeouts and adapted postgres.js JSON/date representations. All synthetic Auth users, staff, records, history, and its temporary operator role grant were rolled back. This does not replace a real authenticated HTTP workflow or load test.

The 0.5.0 Vercel release is ready. Live checks passed database readiness, all three protected identity routes, retained/original identity response fields, timeline/history contracts, and existing account setup/assets/configuration. These new workflows remain API-only. Code predating 0.5.0 cannot correctly present retained identity mappings after links exist; rollback must use a compatible application release and preserve the identity history and original enrollment ownership.

Section 2B.2 adds [enrollment timeline corrections](enrollment-timeline.md) through additive migration `0006`. Hosted rollback-only checks passed preview/confirmation, original-event preservation, subsequent ordinary movements, teacher visibility, a 260-entry timeline, correction history, and stale-version rejection, with the API's statement/lock timeouts. The operator harness adapts postgres.js JSON and date representations to the runtime pg interface. All synthetic fixtures and its temporary role grant were rolled back. This is service/database integration coverage, not a real authenticated HTTP load test.

The 0.4.0 Vercel release built successfully. Live checks verified database readiness, the four protected timeline operations, unauthenticated rejection, the explicit original-history contract, and existing account setup/assets/configuration. No frontend screens were added. A rollback to code predating 0.4.0 would lose effective-timeline presentation and history labels; do not treat original movement rows alone as corrected history after this migration. Preserve correction tables and use a compatible application release for rollback.

Section 2B.1 adds [reviewed roster import and LRN correction](registry-review.md) through migration `0005`. A real Supabase rollback-only check exercised a 50-row preview with no staged learners, atomic commit, identical retry receipt, assigned-LRN correction/history, and teacher SQL boundaries. Synthetic Auth users, sections, learners, enrollments, review receipts, history, and the temporary operator role grant were rolled back. The hosted harness adapts postgres.js JSON parameter serialization to the API's pg interface; an initial harness mismatch was corrected before the successful run. These service/database checks do not replace a real authenticated HTTP workflow.

The Vercel release built successfully and live checks verified API version 0.3.0, database readiness 200, all six new contract operations, unauthenticated rejection 401, account setup/assets, CSP, and public configuration. An initial CLI authorization error resolved after verifying the existing login/project and retrying; no account or credential configuration changed. Section 1 frontend screens are retained; the new import and correction workflows are API-only.

Section 2A adds the learner registry and enrollment APIs described in [learner registry](learner-registry.md). Migration `0004` is additive; the existing database role, credentials, staff, and school setup are retained. Hosted verification checked real TLS and date parsing, anonymous learner isolation, manager enrollment commands, teacher boundaries, immutable movement history, stale-version rejection, and read-access audit. Its synthetic Auth users, school year, sections, learner, enrollment, events, and temporary operator role grant were all rolled back. After deployment, database readiness returned 200, the OpenAPI contract reported version 0.2.0, and all three new collection routes rejected unauthenticated requests with 401. Competing-write tests run against embedded PostgreSQL; these checks are not a full multi-session hosted API load test. The Section 1 frontend remains unchanged.

Create a dedicated Supabase project owned by the school or its designated operator. Configure asymmetric JWT signing (ES256 or RS256); this API rejects legacy HS256 tokens. Disable public/anonymous signup. Configure exact callback URLs, Auth rate limits, and reliable SMTP before school-wide invitations. Keep `edunexus` out of Data API exposed schemas. [Supabase production guidance](https://supabase.com/docs/guides/platform/going-into-prod).

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
| `ALLOWED_ORIGINS` | Comma-separated exact HTTPS frontend origins | No |
| `PROVISION_FUNCTION_URL` | Account-service Edge Function URL. Omit to keep the operator link-by-UUID route | No |
| `PROVISION_FUNCTION_SECRET` | Shared secret for that function, 32+ characters. Never a Supabase key | Yes |
| `LOG_LEVEL` | `info` by default | No |

Never upload `MIGRATION_DATABASE_URL`, the database owner password, bootstrap fields, local development secrets, or Supabase service-role keys. Vercel uses Express, Node 24, the repository root, `npm run build`, and Singapore `sin1` from `vercel.json`. `src/index.ts` is the sole Vercel application entrypoint. The app factory lives in `src/http-app.ts` so framework detection cannot select it accidentally. [Express deployment](https://vercel.com/docs/frameworks/backend/express).

After setting variables, deploy to the dedicated project:

```powershell
rtk proxy npm.cmd exec --yes --package=vercel -- vercel deploy --prod
```

Configure preview environments separately with development-only credentials and exact origins. Do not point preview builds at the school's real-data database. Configure edge abuse controls for anonymous traffic; the shared per-staff limiter applies after token verification. Keep migrations out of build hooks.

## Initial account and staff provisioning

Use Supabase Auth's administrative invitation workflow with a working callback URL. Never send a password in email. The managed service returns the user's UUID. Set `BOOTSTRAP_PRINCIPAL_ID` and `BOOTSTRAP_PRINCIPAL_NAME` locally, then run `npm run db:bootstrap`. The script requires an invited or confirmed, non-deleted, non-banned Auth identity and an empty staff registry. It creates the school profile with no invented school ID. Bootstrap fails safely if staff already exist.

After the user follows the invitation, `/account/setup` sets a password. A successful `/api/v1/me` call confirms API access. Auth identity approval and staff activation are separate controls.

### The account service

Subsequent staff are created by a manager in the workspace, through an Edge Function that holds the service-role key so the API runtime does not have to. Deploy it once:

```powershell
rtk proxy npx.cmd supabase functions deploy create-staff-identity --no-verify-jwt
rtk proxy npx.cmd supabase secrets set EDUNEXUS_PROVISION_SECRET=<32+ random characters> EDUNEXUS_INVITE_REDIRECT=https://edunexus-balili.vercel.app/account/setup
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically; do not set them by hand and never copy the service-role key into Vercel. Put the same random secret into Vercel as `PROVISION_FUNCTION_SECRET`, and the function's URL as `PROVISION_FUNCTION_URL`. Rotate the secret by setting it in both places.

Without these two variables the endpoint answers `IDENTITY_SERVICE_DISABLED` and nothing else changes: the operator invites the identity in Supabase and a manager links its UUID with `POST /api/v1/staff-invitations/:id/provision`, or authorizes it directly with `POST /api/v1/staff`.

## Smoke checks and release discipline

Check `/health/live` for HTTP 200. `/health/ready` must return 503 before bootstrap and 200 afterward. It does not imply successful email delivery. Check `/account/setup`, `/account.js`, CSP, and public-key-only `/account/config`. `/api/v1/me` without a token must return 401. A verified staff session must return its database role. Where an account service is configured, create one synthetic staff account end to end and confirm the invitation email arrives, then remove that identity. Test a teacher against another section.

Run `npm run check` and regenerate `docs/openapi.json` before deployment. CI checks types, tests, build, contract freshness, and high-severity runtime dependency advisories. Add migrations instead of editing applied files. A Vercel code rollback does not reverse database migrations; use compatible schema changes and a rehearsed recovery procedure.

## School production rollout

This environment is for development. Before real learner data, the school needs ownership/recovery arrangements, approved hosting costs and availability, data handling responsibilities, restore-tested backups, and staff training. Plan settings affect pausing and backup availability; select them explicitly with the school. Database backups do not substitute for a separate recovery plan for future private document objects. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Record recovery-point and recovery-time objectives, restore into an isolated project, verify restored records and access policies, and test full workflows there. Do not describe the system as production-ready based only on unit tests, an API health check, or a successful build.
