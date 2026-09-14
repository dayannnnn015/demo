# EDUNEXUS

EDUNEXUS supports learner attendance and academic records for Balili Elementary School, La Trinidad, Benguet. It currently implements staff/school setup, learner registration/enrollment, reviewed roster imports, LRN and timeline corrections, learner identity reconciliation, enrollment void/restoration, grade-placement corrections, instructional calendars, and **Section 3B.3: classroom absence monitoring**. Backend development remains the priority. The basic [school workspace](https://edunexus-balili.vercel.app/app) exposes Section 1 forms; learner, calendar and attendance screens and full frontend design are deferred.

The manuscript has been analyzed and the work is divided into reviewable sections. Read [the manuscript analysis](docs/manuscript-analysis.md), [implementation roadmap](docs/roadmap.md), and [architecture](docs/architecture.md) before extending it.

## What works in Section 1

- Supabase staff token verification with signature, issuer, audience, expiration, MFA, and live identity checks.
- Principal, administrative officer, and teacher permissions, enforced in the API and PostgreSQL row-level policies.
- Staff authorization, updates, suspension, and protection against self-lockout or removing the last principal.
- School profile, draft/active/closed school years, configurable reporting periods, and Kindergarten–Grade 6 sections with adviser assignments.
- Teacher access restricted to their assigned sections.
- Version checks to prevent lost updates, transactional audit records, and persistent request limits.
- Versioned SQL migrations, an OpenAPI contract, automated tests, CI, and Vercel configuration.

## What works in Section 2A

- Minimal learner identities with unique official LRNs, pending-LRN support, and versioned profile corrections.
- Scoped learner search and annual enrollment, with one enrollment per learner per school year.
- Dated same-grade section reassignment, withdrawal, and reentry with immutable event history.
- Manager-only changes and teacher visibility limited to current assigned open-year rosters.
- Read-access auditing, atomic rollback, protected history, and current-version checks on movements.

## What works in Section 2B.1

- Bounded class-roster CSV validation and preview with explicit duplicate resolution.
- Confirmation bound to the reviewed file and record versions, atomic import, and safe retry receipts.
- Reviewed assigned-LRN correction preserving previous values, reason, actor, and request metadata.
- Database/API restrictions on preview ownership and protected correction history.

## What works in Section 2B.2

- Enrollment timeline preview and manager confirmation with version/context checks.
- Repair of dates, initial assignment, missed movements, and mistaken movements with immutable before/after snapshots.
- Effective timeline resolution alongside preserved original movement records, with updated teacher roster access.

## What works in Section 2B.3

- Reviewed, reversible duplicate links with preserved profiles and original enrollment history.
- Conflict checks for assigned LRNs, identity fields, annual enrollment, and stale reviews.
- Retained learner roster visibility, protected history, and import/timeline integration.

## What works in Section 2B.4

- Reviewed void/restoration of erroneous annual records, with immutable evidence and preserved timelines.
- Explicit retained-record references for duplicates and conflict protection on restoration.
- Roster/import/identity integration, with voided records excluded from valid annual enrollment.

## What works in Section 2B.5

- Reviewed whole-year grade correction with explicit replacement sections across the effective timeline.
- Preserved original movements, dates, reasons, and enrollment identity, with immutable old/new grade evidence.
- Updated teacher roster access and compatibility with later movements, timeline corrections, and reviewed reversal.

Read [learner registry](docs/learner-registry.md), [registry review](docs/registry-review.md), and [enrollment timeline](docs/enrollment-timeline.md) for API workflows and limits. Read [learner identity](docs/learner-identity.md) for linking and reversal. Read [enrollment record review](docs/enrollment-records.md) for resolving overlapping annual records. [Grade-placement corrections](docs/grade-placement.md) are implemented. School-reviewed sample mappings, additional learner fields, and class-capacity decisions remain. Attendance consolidation, grading, promotion, and forms remain subsequent work. No real learner data has been imported. See [deployment](docs/deployment.md); real invited-user MFA login and school acceptance remain to be verified.

## What works in Section 3A

- Explicit AM/PM schedules with classroom, alternative-delivery, no-class and suspended modes.
- School baselines and section overrides, with unknown dates kept unconfigured.
- Manager preview/confirmation, conflict protection, immutable review history and atomic batches.
- Effective schedule reads for assigned teachers, bounded requests and shared calendar version checks.

Read [instructional calendars](docs/instructional-calendar.md).

## What works in Section 3B.1

- Dated sheets using effective enrollment history and current teacher access restrictions.
- Reviewed classroom AM/PM present/absent marks in atomic batches of up to 100 learners.
- Explicit unknown marks, corrections/clearing, protected history and stale-review checks.
- Calendar/enrollment guards preventing existing attendance from being silently invalidated.

Read [daily attendance](docs/daily-attendance.md).

## What works in Section 3B.2

- Monthly readiness with complete date-effective membership, explicit unknowns and raw classroom session counts.
- Manager-reviewed submission, return, locking and reopening with immutable submission snapshots.
- Frozen-month guards for daily marks, calendars, enrollment and identity corrections.
- Teacher status-only access, manager snapshot/history pagination and atomic version/hash checks.

Read [monthly attendance](docs/monthly-attendance.md). Alternative-delivery conversion, official totals and absence alerts remain later work. Monthly workflows are API-only.

## What works in Section 3B.3

- Read-only classroom absence monitoring over 1–31 dates, with filtered 100-learner pages.
- Raw session observations, missing/unsupported data and within-range absence runs.
- Current teacher access, historical manager access and returned-record auditing.
- Live correction refresh and monthly freeze status without changing saved snapshots.

Read [absence monitoring](docs/attendance-monitor.md). School alert policies, follow-up case management and notifications remain later work; this increment is API-only.

## Development

Requirements: Node.js 24, npm, and a dedicated Supabase development project. Automated database tests use PGlite and do not need Docker or cloud credentials.

```powershell
rtk proxy npm.cmd ci --ignore-scripts
rtk proxy npm.cmd run check
rtk proxy npm.cmd run api:export
```

For an API connected to Supabase, copy `.env.example` to `.env` and complete the deployment setup below. Do not use a privileged database URL as `DATABASE_URL`.

```powershell
rtk proxy npm.cmd run db:migrate
rtk proxy npm.cmd run db:credentials
rtk proxy npm.cmd run db:bootstrap
rtk proxy npm.cmd run dev
```

The local API listens on `http://127.0.0.1:3001`. `npm run build` compiles the backend; `npm start` runs that build. The live runtime uses PostgreSQL, never the PGlite test fixture.

## API

The machine-readable contract is [docs/openapi.json](docs/openapi.json) and is served at `/openapi.json`. [Frontend integration](docs/frontend-handoff.md) explains authentication, response envelopes, dates, pagination, and version conflicts.

All business endpoints are under `/api/v1` and require `Authorization: Bearer <Supabase access token>`. `/`, `/health/live`, `/health/ready`, `/openapi.json`, `/app`, and the account setup/configuration endpoints are public and return no personal records. `/app` and `/account/setup` share password/MFA sign-in and open the Section 1 workspace after authentication. The workspace supports school profile edits, staff authorization/access updates, school years, reporting periods, sections/advisers, and activity history. Sessions remain in memory, so refreshing requires signing in again. Readiness checks the database, restricted runtime role, school bootstrap, and rate-limit function; it does not certify an end-to-end Supabase login.

## Repository layout

```text
src/core/                 Authentication, configuration, database, errors
src/modules/foundation/   Section 1 contracts and business operations
src/modules/registry/     Section 2A learner and enrollment operations
src/modules/registry-review/ Roster import review and LRN corrections
src/modules/enrollment-timeline/ Effective timelines and reviewed corrections
src/modules/learner-identity/ Reviewed duplicate links and reversals
src/modules/enrollment-records/ Reviewed annual-record void and restoration
src/modules/grade-placement/ Reviewed whole-year grade corrections
src/modules/calendar/    Reviewed school/section instructional schedules
src/modules/attendance/  Dated sheets and reviewed classroom AM/PM marks
src/modules/attendance-months/ Monthly completeness, snapshots and locks
src/modules/attendance-monitor/ Scoped absence and completion evidence
src/operations.ts         Combined versioned route catalog
src/http-app.ts           HTTP boundary and route registration
database/migrations/     Ordered, immutable SQL migrations
scripts/                 Migration, operator setup, API export
tests/                   PostgreSQL, API, and signed-token tests
docs/                    Requirements, decisions, deployment, API handoff
```

Passwords, tokens, database URLs, and manuscript extracts belong only in ignored `.env`/`.local` files. The manuscript remains in its original location and is not committed into this repository.
