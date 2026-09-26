# EDUNEXUS

EDUNEXUS supports learner attendance and academic records for Balili Elementary School, La Trinidad, Benguet. It currently implements staff/school setup, learner registration/enrollment, reviewed roster imports, LRN and timeline corrections, learner identity reconciliation, enrollment void/restoration, grade-placement corrections, instructional calendars, daily/monthly attendance, manual follow-up, subject catalog/section offerings, and **Section 4B.1: assessment tasks and raw score entry**. Staff invitations are tracked records and account recovery can be initiated from the sign-in page. Backend development remains the priority. The [school workspace](https://edunexus-balili.vercel.app/app) covers Section 1 setup, the Section 2A learner registry and enrollment, and the whole of Section 3 attendance: the instructional calendar, the daily register, monthly consolidation, the absence monitor and manual follow-up cases, plus the subject catalog and each section's subject offerings. Later modules are API-only and appear as honest placeholders.

Picking this project up, as a person or an agent? Start with [AGENTS.md](AGENTS.md), the working contract, and [where things stand](docs/status.md). `CLAUDE.md` points at the same file, so Claude Code and Codex read identical instructions.

The manuscript has been analyzed and the work is divided into reviewable sections. Read [standing rules, gates and settled decisions](docs/constraints.md) first: it records what must never be built and what is blocked on a school decision, and [school information requests](docs/school-information-requests.md) lists what to ask the school to unblock it, against what [the school's own forms](docs/school-forms.md) already establish. Then read [the manuscript analysis](docs/manuscript-analysis.md), [implementation roadmap](docs/roadmap.md), and [architecture](docs/architecture.md) before extending it.

The [20 September backend review](docs/backend-review-2026-09-20.md) records the maintenance fixes and the four score-database defects it reproduced; migration `0022` corrected all four. Existing test coverage is not a production-readiness claim.

## What works in Section 1

- Supabase staff token verification with signature, issuer, audience, expiration, and live identity checks.
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
- Read-access auditing, atomic rollback, protected history, and current-version checks on movements. Managers review the read log by staff member or by record ID on the Privacy access log screen.

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

Read [learner registry](docs/learner-registry.md), [registry review](docs/registry-review.md), and [enrollment timeline](docs/enrollment-timeline.md) for API workflows and limits. Read [learner identity](docs/learner-identity.md) for linking and reversal. Read [enrollment record review](docs/enrollment-records.md) for resolving overlapping annual records. [Grade-placement corrections](docs/grade-placement.md) are implemented. School-reviewed sample mappings, additional learner fields, and class-capacity decisions remain. Attendance consolidation, grading, promotion, and forms remain subsequent work. No real learner data has been imported. See [deployment](docs/deployment.md); real invited-user sign-in and school acceptance remain to be verified.

## What works in Section 3A

- Explicit AM/PM schedules with classroom, alternative-delivery, no-class and suspended modes.
- School baselines and section overrides, with unknown dates kept unconfigured.
- Manager preview/confirmation, conflict protection, immutable review history and atomic batches.
- Effective schedule reads for assigned teachers, bounded requests and shared calendar version checks.
- A manager screen reading one month at a time, setting or clearing dates through preview and confirmation, and showing every change in the year.

Read [instructional calendars](docs/instructional-calendar.md). An unconfigured date is drawn as unknown on that screen, never blank: it is not a holiday, not a school day and not an absence.

## What works in Section 3B.1

- Dated sheets using effective enrollment history and current teacher access restrictions.
- Reviewed classroom AM/PM present/absent marks in atomic batches of up to 100 learners.
- Explicit unknown marks, corrections/clearing, protected history and stale-review checks.
- Calendar/enrollment guards preventing existing attendance from being silently invalidated.
- An adviser screen marking one section on one date, both sessions, reviewed and committed as one batch.

Read [daily attendance](docs/daily-attendance.md). A mark is present, absent or unrecorded, and the third is a real choice: only an explicit null clears one, and an unmarked session is never read as presence.

## What works in Section 3B.2

- Monthly readiness with complete date-effective membership, explicit unknowns and raw classroom session counts.
- Manager-reviewed submission, return, locking and reopening with immutable submission snapshots.
- Frozen-month guards for daily marks, calendars, enrollment and identity corrections.
- Teacher status-only access, manager snapshot/history pagination and atomic version/hash checks.
- A manager screen offering only the transitions the current state allows, with every blocking issue written as a sentence.

Read [monthly attendance](docs/monthly-attendance.md). Alternative-delivery conversion, official totals and absence alerts remain later work. Every count the screen shows is a raw classroom session, and it says so.

## What works in Section 3B.3

- Read-only classroom absence monitoring over 1–31 dates, with filtered 100-learner pages.
- Raw session observations, missing/unsupported data and within-range absence runs.
- Current teacher access, historical manager access and returned-record auditing.
- Live correction refresh and monthly freeze status without changing saved snapshots.
- A screen over a window of up to 31 dates, validated before the request, with every count stated beside the window that produced it.

Read [absence monitoring](docs/attendance-monitor.md). School alert policies and notifications remain later work: there is no threshold on that screen, because the school has no approved rule to put there.

## What works in Section 3B.4

- Manager-reviewed follow-up cases for recorded absences or gaps in recording.
- Assigned managerial responsibility, due dates, notes, resolution, cancellation and reopening.
- Immutable opening evidence and action history, with current-evidence comparisons.
- Duplicate-open-case protection, filtered queues and post-closure case resolution.

Read [attendance follow-up](docs/attendance-followups.md). The school has no approved automatic-alert rule, so automation and messages remain disabled. Managers open and act on cases by hand on the Follow-up cases screen.

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

Read [assessment-policy binding](docs/assessment-policy-bindings.md). Binding is a scoping record.

## What works in Section 4B.1

- Named assessments whose component codes come from the bound adopted revision, never invented.
- Raw marks in batches of up to 100, each against its own version, with unrecorded learners left null rather than zero.
- Clearing that preserves history, protection against lowering a maximum below a recorded mark, and archival.
- Adviser entry for current sections, manager historical access, and manager-only task and score journals.
- Marks of a learner who has left are kept for managers and closed to their former adviser, in SQL as well as over HTTP.
- Only an explicit null clears a mark, and every score read names the learners it disclosed in the privacy audit.

Read [assessment tasks and raw scores](docs/assessment-scores.md). No total, average, percentage, transmutation or grade is computed anywhere; those wait on the school grading enclosure.

## What works in staff invitations

- Manager-recorded invitation requests with intended email, name and permission level.
- Operator-provisioned Auth identities linked so school access and the invitation complete in one transaction.
- One open request per email, terminal completion and cancellation, and protected history.
- Browser-initiated password recovery from the sign-in page, answering identically whether or not an address is registered.

Read [staff invitations](docs/staff-invitations.md). A manager records the request, then creates the account from the same screen. The API runtime still holds no service-role key: the key is confined to an isolated Edge Function whose only action is inviting one address, and a deployment without one keeps the operator's link-by-UUID route.

## What works in the school workspace

The workspace at `/app` is a keyboard-navigable administrative interface: a deep navy navigation rail against white working surfaces, so the records are the brightest thing on screen. It is drawn as a register — square corners, hairline rules between rows and a heavier rule under the column heads — because every form it feeds is a ruled sheet and that is the structure the staff already read. The modules it covers are real screens; the rest appear in the navigation as honest placeholders rather than disappearing. It covers:

- **An overview**: where the school year stands — its reporting periods with today marked, how many learners are enrolled at each grade, sections by grade, the section-and-adviser list, who holds access, and the latest recorded changes. The learner count names nobody, so loading the Overview writes nothing to the privacy audit. No average, attendance rate or standing appears, and the screen says so.
- **Section 1 setup**: school profile, staff authorization and access, school years, reporting periods, sections and advisers, and the change-audit history.
- **Attendance, end to end**: configure the instructional calendar a month at a time, mark a section morning and afternoon, review a month and submit or lock it, read recorded absences and gaps over a chosen window, and open, reassign and resolve a follow-up case by hand.
- **Subjects and section offerings**: managers maintain the subject catalog and choose each section's subjects, each offering pinned to the catalog revision it was chosen from; advisers read their own section's list.
- **Roster import**: preview a class list from the EDUNEXUS CSV template, decide each possible duplicate explicitly, then import the identical reviewed file into one section in one step, all rows or none.
- **Assessment policies**: record the school's policy as an unapproved draft of components and weights, record the school's adoption of one exact revision for a year, and bind it to a section's subjects. The weights are typed from the school's documents; nothing supplies a default and nothing computes from them.
- **Every module still to come, listed honestly**: score entry appears in the navigation with what they will do and what they wait on, so a walkthrough shows the whole shape of the system.
- **The privacy access log**: every read that returned a learner or enrollment record — who, when, what kind of read and which record IDs — narrowed to one staff member or one record. A learner's own panel links straight to the reads of that learner. It shows IDs, not names, because resolving a name would itself be a read.
- **Staff invitations**: request an invitation, record the operator-provisioned identity, or cancel, with the state of every outstanding request.
- **Section 2A learner registry**: scoped search by name, exact LRN or birth date; managers register learners, correct details, fill a pending LRN, and read each learner's annual enrollment records.
- **Enrollment and movements**: enrol a learner into a section, then record dated reassignment, withdrawal with a recorded reason, and re-entry, with immutable movement history.
- **Reviewed corrections**: correct a recorded timeline or a year's grade, void or restore an annual record, correct an assigned LRN, and link or unlink duplicate registry entries for the same child. Each shows the server's own review of the change before it is confirmed, and every original stays on file.

**A record that does not exist is drawn, not left blank.** An unmarked attendance session and an unentered score are null, never zero and never "present", so a missing value carries a ruled diagonal mark and says what is missing — "LRN not issued", "No adviser". The same mark, at panel size, is what the Overview uses to name the general average, attendance rate, academic standing and class ranking this system may not state, and what each of them waits on. An em dash would read as a value somebody typed.

**Ctrl+K opens a command palette** onto all twenty screens. It searches their names, sections and descriptions and nothing else: every learner and enrollment list writes an access-log row naming the exact records returned, so a palette that searched the registry would write one per keystroke.

**Errors sit beside the field that caused them.** A rejected save marks each field, prints the server's own message under it, and focuses a summary that lists every problem and jumps to each one. Creating a record opens a side panel rather than a second form parked under the list, and anything irreversible is confirmed in a dialog that states the consequence rather than asking "are you sure".

**The workspace prints.** A section list is carried to a classroom on paper, so printing drops the navigation and the chrome, keeps the register, and repeats table headings across pages.

Sessions are held in `sessionStorage`, so a refresh keeps you signed in and closing the tab ends the session. Sign-in, invitation completion, password recovery and changing your own password from the profile menu all run against Supabase from the browser; a change asks for the current password first.

Role-aware navigation hides what a staff member cannot use, but the API remains the authority. Teachers receive only their currently assigned learners. Reviewed learner corrections — an LRN, a timeline, a duplicate identity, a voided record, a grade placement — are manager-only and each goes through a review before it is confirmed. Advisers read the subjects offered to their own sections; only managers change the catalog or an offering. Attendance does not: an adviser marks and monitors their own sections and reads their own section's calendar, while consolidation, calendar changes and every change history are manager-only.

A screen states what it is in one line and names the DepEd form its records end up on, because staff navigate by form name rather than by module. Identifiers are set in a monospaced face throughout, so a twelve-digit LRN can be checked against paper a digit at a time.

The rail groups the twenty screens and each group folds away; the rail itself collapses to an icon strip, and both preferences end with the tab rather than following a person around a shared staffroom machine. The top bar carries the page title, the active school year — the scope every record is filed under — the palette and the signed-in identity. There is no notification bell: nothing in this system may raise an alert yet, so a badge would imitate a signal that does not exist.

Read [frontend integration](docs/frontend-handoff.md) before extending it.

## Release history

[CHANGELOG.md](CHANGELOG.md) lists every released increment, its manuscript section and its database migration. The current release is **0.28.0**.

## Development

Requirements: Node.js 24, npm, and a dedicated Supabase development project. The workspace is a Vite + React app in `web/`, built into `public/` and served by the API at `/app`. Automated database tests use PGlite and do not need Docker or cloud credentials.

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

Run `npm run dev:web` alongside `npm run dev` for a hot-reloading frontend on Vite's port, proxying the API to 3001. `npm run build` produces the bundle the API serves at `/app`.

The local API listens on `http://127.0.0.1:3001`. `npm run build` compiles the backend; `npm start` runs that build. The live runtime uses PostgreSQL, never the PGlite test fixture.

## API

The machine-readable contract is [docs/openapi.json](docs/openapi.json) and is served at `/openapi.json`. [Frontend integration](docs/frontend-handoff.md) explains authentication, response envelopes, dates, pagination, and version conflicts.

All business endpoints are under `/api/v1` and require `Authorization: Bearer <Supabase access token>`. `/`, `/health/live`, `/health/ready`, `/openapi.json`, `/app`, and the account setup/configuration endpoints are public and return no personal records. `/`, `/app` and `/account/setup` all open the workspace described above, sharing the same password sign-in. Readiness checks the database, restricted runtime role, school bootstrap, and rate-limit function; it does not certify an end-to-end Supabase login.

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
src/modules/staff-invitations/ Tracked staff invitations and operator linking
src/modules/assessment-scores/ Named assessments and raw learner marks
src/operations.ts         Combined versioned route catalog
src/http-app.ts           HTTP boundary and route registration
web/                     Vite + React workspace (built into public/)
database/migrations/     Ordered, immutable SQL migrations
scripts/                 Migration, operator setup, API export
tests/                   PostgreSQL, API, and signed-token tests
AGENTS.md                Working contract for agents and contributors
docs/status.md           Where the last session stopped and what is next
docs/constraints.md      Standing rules, blocking gates and settled decisions
docs/erd.md              Entity relationship diagram of all 44 tables
docs/school-information-requests.md  What to ask the school, in priority order
docs/school-forms.md     What the school's own SF2, SF4 and SF9 specify
docs/                    Requirements, decisions, deployment, API handoff
CHANGELOG.md             Released increments, sections and migrations
```

Passwords, tokens, database URLs, and manuscript extracts belong only in ignored `.env`/`.local` files. The manuscript remains in its original location and is not committed into this repository.
