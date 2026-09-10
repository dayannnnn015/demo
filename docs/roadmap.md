# Backend implementation roadmap

Build and review one section at a time. The user wants sustained backend refinement before frontend handoff. Do not implement later sections merely to fill out an interface.

## Section 1 — Staff authorization and school setup

Implemented locally: managed-token authentication, MFA enforcement on deployments, database-backed roles, existing Auth-user authorization, account suspension, school profile, academic years, flexible periods, sections/advisers, audit events, version checks, request limits, migrations, OpenAPI, and automated tests.

The dedicated development Supabase project and migrations are provisioned. Vercel runtime configuration and deployment are complete, live route checks pass, and the initial administrator identity and school profile are bootstrapped. Supabase accepted the administrator invitation for email delivery. The invited user's password/MFA enrollment and authenticated API check remain to be verified. Staff creation currently authorizes an identity already provisioned in Supabase Auth. A basic account setup/sign-in page supports password setup and MFA, while in-app invitation management and recovery initiation remain unimplemented. No learner data belongs in this section.

A basic workspace at `/app` now exposes the existing Section 1 operations through forms, including role-aware navigation, school setup, staff access, years/periods, sections/advisers, and activity history. This is a usability aid for backend review, not an expansion into learner or attendance modules.

Acceptance: manager/teacher boundaries hold in SQL and HTTP; stale edits fail; suspended users are denied; audit events cannot be edited by the runtime; year/period/section constraints work; the build succeeds. Hosted acceptance additionally requires migrations on a development Supabase project, MFA login, a restricted database connection, and a passing Vercel smoke test.

## Section 2 — Learner registry and enrollment

Add a permanent learner identity, reviewed minimum profile fields, LRN validation and duplicate resolution, annual enrollment, class assignment history, movements with effective dates, and scoped retrieval. Import from a reviewed sample through a validation/preview/commit workflow. Resolve teacher class-list authority first.

Acceptance: duplicate detection, invalid dates, transfer and section-change history, correct adviser visibility, rejected cross-section requests, import rollback, and concurrent assignment conflicts.

## Section 3 — Attendance and monthly consolidation

Add instructional calendars, holidays and suspensions, AM/PM attendance, bulk transactions, missing-mark handling, correction history, consecutive absence alerts, submission/review/lock workflow, and SF2/SF4 data models. Confirm attendance arithmetic from approved templates before coding it.

Acceptance: school-approved fixtures match all daily/monthly totals, partial attendance and movement dates are correct, unmarked sessions remain visible, late corrections are controlled, and concurrent saves do not lose marks.

## Section 4 — Academic records and grading

Implement versioned grade-band policies, subjects, reporting periods, assessment components, score constraints, decimal arithmetic, reproducible computations, missing-score handling, summaries, and reviewed finalization. Independently verify the current DepEd enclosure and school ECR examples; preserve policies for historical years.

Acceptance: boundary and rounding fixtures match the approved ECR/manual calculation; changing a policy cannot retroactively change finalized grades; only assigned staff can enter results; Kindergarten behavior is explicit.

## Section 5 — Promotion and next-year assignment

Add reviewed promotion/remediation decisions and reproducible randomization with recorded seed, constraints, capacity, preview, approval, and transactional commit. Preserve source-year enrollment and academic records. Randomization never decides promotion eligibility.

Acceptance: no duplicated or lost learners, capacities respected, repeatable preview, safe retries, conflict protection, and full history.

## Section 6 — Official forms and private documents

Render school-approved SF2/SF4/SF9/SF10 templates from validated data, create immutable release snapshots, record signatories/template versions, and deliver through private storage and short-lived authorized downloads. Document export/read access without leaking document contents into logs.

Acceptance: school staff reconcile representative exported forms with their approved examples; dates, calculations, layouts, signatures, release versions, and historical values match.

## Section 7 — Operational acceptance and turnover

Test the hosted API with at least 27 concurrent teacher sessions and preferably the complete expected staff cohort. Establish latency/error targets with the client. Exercise backup restoration into an isolated project, privilege revocation, incident recovery, deployment rollback, migrations, data retention, and private document recovery. Complete UAT, TAM evaluation, operational runbooks, and staff training.

Automated tests check isolation and version behavior on embedded PostgreSQL. A separate hosted smoke check also verified the real Supabase runtime role, date parsing, 27 concurrent transaction contexts, teacher isolation, version checks, and audit writes, then rolled back every synthetic fixture. These checks do not establish full API throughput, realistic multi-session authentication load, every concurrent locking race, or backup recoverability.
