# EDUNEXUS implementation roadmap

Build and review one section at a time. The user wants sustained backend refinement before frontend handoff. Do not implement later sections merely to fill out an interface.

## Section 1 — Staff authorization and school setup

Implemented locally: managed-token authentication, MFA enforcement on deployments, database-backed roles, existing Auth-user authorization, account suspension, school profile, academic years, flexible periods, sections/advisers, audit events, version checks, request limits, migrations, OpenAPI, and automated tests.

The dedicated development Supabase project and migrations are provisioned. Vercel runtime configuration and deployment are complete, live route checks pass, and the initial administrator identity and school profile are bootstrapped. Supabase accepted the administrator invitation for email delivery. The invited user's password/MFA enrollment and authenticated API check remain to be verified. Staff creation currently authorizes an identity already provisioned in Supabase Auth. A basic account setup/sign-in page supports password setup and MFA, while in-app invitation management and recovery initiation remain unimplemented. No learner data belongs in this section.

A basic workspace at `/app` now exposes the existing Section 1 operations through forms, including role-aware navigation, school setup, staff access, years/periods, sections/advisers, and activity history. This is a usability aid for backend review, not an expansion into learner or attendance modules.

Acceptance: manager/teacher boundaries hold in SQL and HTTP; stale edits fail; suspended users are denied; audit events cannot be edited by the runtime; year/period/section constraints work; the build succeeds. Hosted acceptance additionally requires migrations on a development Supabase project, MFA login, a restricted database connection, and a passing Vercel smoke test.

## Section 2 — Learner registry and enrollment

**Section 2A is implemented:** minimal permanent learner identity, unique 12-digit LRNs with pending assignment, profile corrections, scoped search, annual enrollment, dated section reassignment, withdrawal/reentry, immutable movement history, and read-access audit. The user confirmed that principals and administrative officers make changes; teachers only view assigned learners. See [the Section 2A contract](learner-registry.md) for effective-date semantics and limitations.

**Section 2B remains:** validation/preview/commit import from a reviewed sample, duplicate reconciliation, assigned-LRN correction, and controlled timeline corrections. Additional learner fields and class capacities require school review. No automatic duplicate merge or bulk import is available yet.

Section 2A validation covers duplicate LRNs, invalid dates, transfer and section-change history, adviser visibility, rejected cross-section requests, transaction rollback, and competing versioned writes. Real Supabase tests exercise the restricted database connection and business functions with rollback-only fixtures. Import rollback and realistic multi-session API load remain later acceptance work.

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
