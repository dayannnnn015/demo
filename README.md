# EDUNEXUS

EDUNEXUS supports learner attendance and academic records for Balili Elementary School, La Trinidad, Benguet. It currently implements staff/school setup, learner registration/enrollment, reviewed roster imports, LRN and timeline corrections, learner identity reconciliation, enrollment void/restoration, grade-placement corrections, instructional calendars, daily/monthly attendance, manual follow-up, subject catalog/section offerings, and **Section 4A.5: assessment-policy offering binding**. Backend development remains the priority. The basic [school workspace](https://edunexus-balili.vercel.app/app) exposes Section 1 forms and a read-only Section 2A learner registry; later modules are API-only and full frontend design is deferred.

The manuscript has been analyzed and the work is divided into reviewable sections. Read [standing rules, gates and settled decisions](docs/constraints.md) first: it records what must never be built and what is blocked on a school decision. Then read [the manuscript analysis](docs/manuscript-analysis.md), [implementation roadmap](docs/roadmap.md), and [architecture](docs/architecture.md) before extending it.

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

Read [absence monitoring](docs/attendance-monitor.md). School alert policies and notifications remain later work; this increment is API-only.

## What works in Section 3B.4

- Manager-reviewed follow-up cases for recorded absences or gaps in recording.
- Assigned managerial responsibility, due dates, notes, resolution, cancellation and reopening.
- Immutable opening evidence and action history, with current-evidence comparisons.
- Duplicate-open-case protection, filtered queues and post-closure case resolution.

Read [attendance follow-up](docs/attendance-followups.md). The school has no approved automatic-alert rule, so automation and messages remain disabled. Cases are API-only.

## What works in Section 4A.1

- Explicit subject catalog with stable codes, learning-area/domain kind and grade applicability.
- Versioned metadata changes, archival and protected before/after history.
- Staff metadata reads, manager-only changes and no seeded curriculum or grading formula.

Read [subject catalog](docs/subject-catalog.md). This increment is API-only.

## What works in Section 4A.2

- Per-section subject selections preserve the selected catalog revision.
- Explicit draft-year refresh, retirement/reactivation, display order and protected history.
- Grade applicability, stale-version, archival and closed-year checks.
- Manager-only changes and current-adviser reads without expanded learner permissions.

Read [section offerings](docs/section-subjects.md). Operational grading policies and assessment entry remain subsequent work.

## What works in Section 4A.3

- Manager-only assessment drafts with source references and explicit Grades 1–6 applicability.
- Validated component weights stored as integer basis points totaling 100%.
- Versioned revisions, archival/restoration and protected before/after history.

Read [assessment-policy drafts](docs/assessment-policy-drafts.md). Drafts are non-operational: no approval, offering binding, score entry or grade calculation is enabled.

## What works in Section 4A.4

- Manager-only records that the school adopted one exact unarchived draft revision for one school year.
- Frozen policy snapshots that later draft revisions never change, plus an explicit school reference and in-year adoption date.
- One standing adoption per school year and policy, reviewed one-way withdrawal, and re-adoption afterwards.
- An adopted draft cannot be archived until its adoption is withdrawn.

Read [assessment-policy adoption](docs/assessment-policy-adoptions.md). Adoption records a school decision only: no score entry or grade calculation is enabled, and an adoption reference is not proof of approval.

## What works in Section 4A.5

- Manager-only records of which section subject offering a standing adoption governs.
- Reviewed binding on current offering and adoption versions, one shared school year, an active offering and an applicable section grade.
- One standing binding per offering, reviewed one-way release, and rebinding afterwards.
- Standing bindings block adoption withdrawal and offering retirement until released; closed years are read only.

Read [assessment-policy binding](docs/assessment-policy-bindings.md). Binding is a scoping record: no score entry, arithmetic, transmutation or computed grade exists.

## What works in the school workspace

The workspace at `/app` is a usability aid for backend review, not the final frontend. It covers:

- **Section 1 setup**: school profile, staff authorization and access, school years, reporting periods, sections and advisers, and the change-audit history.
- **Section 2A learner registry, read-only**: scoped search by name, exact LRN or birth date, with each learner's annual enrollment records loaded on request.

Role-aware navigation hides what a staff member cannot use, but the API remains the authority. Teachers receive only their currently assigned learners. Registration, enrollment, movements, reviewed corrections, attendance, calendars and academic setup stay API-only. Sessions are held in memory, so a refresh requires signing in again.

Read [frontend integration](docs/frontend-handoff.md) before extending it.

## Release history

[CHANGELOG.md](CHANGELOG.md) lists every released increment, its manuscript section and its database migration. The current release is **0.16.0**.

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

All business endpoints are under `/api/v1` and require `Authorization: Bearer <Supabase access token>`. `/`, `/health/live`, `/health/ready`, `/openapi.json`, `/app`, and the account setup/configuration endpoints are public and return no personal records. `/app` and `/account/setup` share password/MFA sign-in and open the workspace described above after authentication. Readiness checks the database, restricted runtime role, school bootstrap, and rate-limit function; it does not certify an end-to-end Supabase login.

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
src/modules/attendance-followups/ Manual managerial cases and evidence history
src/modules/subjects/    Explicit subject metadata and revision history
src/modules/section-subjects/ Pinned section offerings and revision history
src/modules/assessment-policies/ Non-operational managerial assessment drafts
src/modules/assessment-adoptions/ Reviewed immutable assessment-policy adoption
src/modules/assessment-bindings/ Adopted policy scoped to section subject offerings
src/operations.ts         Combined versioned route catalog
src/http-app.ts           HTTP boundary and route registration
database/migrations/     Ordered, immutable SQL migrations
scripts/                 Migration, operator setup, API export
tests/                   PostgreSQL, API, and signed-token tests
docs/constraints.md      Standing rules, blocking gates and settled decisions
docs/                    Requirements, decisions, deployment, API handoff
CHANGELOG.md             Released increments, sections and migrations
```

Passwords, tokens, database URLs, and manuscript extracts belong only in ignored `.env`/`.local` files. The manuscript remains in its original location and is not committed into this repository.
