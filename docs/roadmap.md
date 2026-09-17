# EDUNEXUS implementation roadmap

Build and review one section at a time. The user wants sustained backend refinement before frontend handoff. Do not implement later sections merely to fill out an interface.

Read [standing rules, gates and settled decisions](constraints.md) first. It lists what must never be built and what is blocked on a school decision. Where this roadmap and that file disagree, that file wins and this one is wrong. Every **Next:** line below names the gate it waits on, or states that it has none.

## Section 1 — Staff authorization and school setup

Implemented locally: managed-token authentication, MFA enforcement on deployments, database-backed roles, existing Auth-user authorization, account suspension, school profile, academic years, flexible periods, sections/advisers, audit events, version checks, request limits, migrations, OpenAPI, and automated tests.

The dedicated development Supabase project and migrations are provisioned. Vercel runtime configuration and deployment are complete, live route checks pass, and the initial administrator identity and school profile are bootstrapped. Supabase accepted the administrator invitation for email delivery. The invited user's password/MFA enrollment and authenticated API check remain to be verified. Staff creation authorizes an identity already provisioned in Supabase Auth. Staff invitations are now tracked records: a manager requests the email, name and permission level, the operator provisions the Supabase Auth identity, and linking it authorizes school access and completes the invitation in one transaction. Password recovery can be initiated from the sign-in page by the browser. See [staff invitations](staff-invitations.md). EDUNEXUS still never creates an Auth identity, because the runtime deliberately holds no service-role key; authenticator reset and supervised device enrollment remain operator actions needing a written process with the school. No learner data belongs in this section.

A basic workspace at `/app` now exposes the existing Section 1 operations through forms, including role-aware navigation, school setup, staff access, years/periods, sections/advisers, and activity history. It also reads the Section 2A learner registry: scoped search and each learner's annual enrollment records, with no mutations. This is a usability aid for backend review, not an expansion into the correction, attendance or academic modules.

Acceptance: manager/teacher boundaries hold in SQL and HTTP; stale edits fail; suspended users are denied; audit events cannot be edited by the runtime; year/period/section constraints work; the build succeeds. Hosted acceptance additionally requires migrations on a development Supabase project, MFA login, a restricted database connection, and a passing Vercel smoke test.

## Section 2 — Learner registry and enrollment

**Section 2A is implemented:** minimal permanent learner identity, unique 12-digit LRNs with pending assignment, profile corrections, scoped search, annual enrollment, dated section reassignment, withdrawal/reentry, immutable movement history, and read-access audit. The user confirmed that principals and administrative officers make changes; teachers only view assigned learners. See [the Section 2A contract](learner-registry.md) for effective-date semantics and limitations.

**Section 2B.1 is implemented:** minimal-template CSV preview/confirmation/atomic commit, explicit resolution of import duplicates, safe retries, and assigned-LRN corrections with protected history. See [registry review](registry-review.md). Batches contain up to 50 learners in one section and stage no CSV copies.

**Section 2B.2 is implemented:** reviewed enrollment timeline corrections with before/after preview, context/version checks, immutable correction snapshots, updated roster visibility, and resolution of later ordinary movements. Original movement history is retained and explicitly labeled. See [enrollment timeline](enrollment-timeline.md).

**Section 2B.3 is implemented:** reviewed, reversible duplicate identity links preserving original profiles and enrollment histories, with conflict checks and retained-identity roster/import/timeline integration. See [learner identity](learner-identity.md).

**Section 2B.4 is implemented:** reviewed annual-record void/restoration, explicit retained-record references for duplicates, immutable evidence, roster exclusion, and identity/import/timeline integration. See [enrollment record review](enrollment-records.md).

**Section 2B.5 is implemented:** reviewed whole-year grade-placement correction with explicit full-timeline section mapping, immutable grade/timeline evidence, teacher access updates, and reviewed reversal. See [grade placement](grade-placement.md).

School-reviewed sample mappings, additional learner fields, and class-capacity decisions remain for registry acceptance/refinement. Section 3A now supplies the instructional-calendar foundation. No automatic duplicate merge or arbitrary XLSX/LIS importer is available.

Section 2 validation covers duplicate LRNs, invalid dates, movement history, adviser visibility, transaction rollback, competing versioned writes, reviewed import/retry, changed previews, a 50-row batch, and later-row import failure. Real Supabase checks use rollback-only fixtures. Realistic multi-session API load and school acceptance remain later work.

## Section 3 — Attendance and monthly consolidation

**Section 3A is implemented:** explicit AM/PM school calendars and section overrides, distinct classroom/alternative-delivery/no-class/suspended sessions, unconfigured-date handling, reviewed atomic changes, shared versions and protected history. See [instructional calendar](instructional-calendar.md). No official dates are seeded and no attendance credits are computed.

**Section 3B.1 is implemented:** date-effective sheets, reviewed classroom AM/PM marks in 100-learner atomic batches, explicit unknowns, version/hash checks, and protected history. Teachers retain current learner-access restrictions; managers can view historical rosters. Calendar, timeline, placement and void corrections are rejected if they invalidate existing non-null marks. See [daily attendance](daily-attendance.md).

**Section 3B.2 is implemented:** monthly completeness review, manager submission/return/lock/reopen, immutable historical snapshots and frozen-month dependency guards. Teachers can read assigned-section status without historical learner details. See [monthly attendance](monthly-attendance.md). Counts are raw classroom sessions, not official attendance credits.

**Section 3B.3 is implemented:** [bounded classroom absence monitoring](attendance-monitor.md), filtered cursor pages, raw session observations, missing/unsupported data and within-range classroom-absence runs. Current teacher privacy and monthly freeze controls remain intact. No alert threshold or automated follow-up is assigned.

**Section 3B.4 is implemented:** [manual managerial follow-up](attendance-followups.md), reviewed opening from matching evidence, one open case per annual record, assignment/due dates, notes, resolution/cancellation/reopening, immutable history and current-evidence comparisons. Cases survive source corrections and school-year closure without altering attendance.

**Next: policy configuration and school acceptance of attendance workflows.** Gates: **mark meanings and conversion rules**, and **absence-alert rule**. Both are closed, so official totals, half-day credits, alternative-delivery participation/conversion and any automatic alerting stay unbuilt. The school has confirmed it has no approved alert threshold. Obtain approved mark meanings, conversion rules and templates before presenting official totals. The current classroom marks do not assign half-day credits. Academic subject/curriculum foundations can proceed while school policy decisions remain outstanding.

Acceptance: school-approved fixtures match all daily/monthly totals, partial attendance and movement dates are correct, unmarked sessions remain visible, late corrections are controlled, and concurrent saves do not lose marks.

## Section 4 — Academic records and grading

**Section 4A.1 is implemented:** explicit subject codes/names/kinds/grade applicability, archival, versioned changes and protected history. No official curriculum or grading formula is seeded. See [subject catalog](subject-catalog.md).

**Section 4A.2 is implemented:** [section subject offerings](section-subjects.md) pin catalog details, support draft-only explicit refresh and preserve retirement/history. Teachers retain current adviser access without expanded learner permissions.

**Section 4A.3 is implemented:** [managerial assessment-policy drafts](assessment-policy-drafts.md) retain explicit Grades 1–6 applicability, source references and internally consistent component weights with versioned history. Draft and archived states are non-operational; no policy is approved, bound to offerings or used for calculations.

**Section 4A.4 is implemented:** [reviewed assessment-policy adoption](assessment-policy-adoptions.md) records that the school adopted one exact unarchived draft revision for one school year, freezing that revision, an in-year adoption date and the school record reference carrying the decision. Later draft revisions never change a frozen snapshot, an adopted draft cannot be archived, one standing adoption exists per school year and policy, and withdrawal is a reviewed one-way action that preserves evidence.

**Section 4A.5 is implemented:** [offering binding](assessment-policy-bindings.md) records which section subject offering a standing adoption governs, on current offering and adoption versions, within one school year and an applicable section grade. One standing binding exists per offering, release is reviewed and one-way, and a standing binding blocks adoption withdrawal and offering retirement until released.

**Next: score entry and calculation.** Gate: **grading enclosure and ECR examples**, closed. Everything after binding waits on the **grading enclosure and ECR examples** gate, and Kindergarten additionally on the **Kindergarten assessment policy** gate. Do not infer official weights, rounding, transmutation or numeric Kindergarten grading from catalog metadata. Draft weights alone are not a complete grading policy, and an adoption reference is not proof that the content is correct.

Implement versioned grade-band policies, subjects, reporting periods, assessment components, score constraints, decimal arithmetic, reproducible computations, missing-score handling, summaries, and reviewed finalization. Independently verify the current DepEd enclosure and school ECR examples; preserve policies for historical years.

Acceptance: boundary and rounding fixtures match the approved ECR/manual calculation; changing a policy cannot retroactively change finalized grades; only assigned staff can enter results; Kindergarten behavior is explicit.

## Section 5 — Promotion and next-year assignment

Gates: **grading enclosure and ECR examples** (promotion decisions depend on final grades) and **learner fields and class capacity**. Add reviewed promotion/remediation decisions and reproducible randomization with recorded seed, constraints, capacity, preview, approval, and transactional commit. Preserve source-year enrollment and academic records. Randomization never decides promotion eligibility.

Acceptance: no duplicated or lost learners, capacities respected, repeatable preview, safe retries, conflict protection, and full history.

## Section 6 — Official forms and private documents

Gate: **official form templates**, and for SF2/SF4 also **mark meanings and conversion rules**. Render school-approved SF2/SF4/SF9/SF10 templates from validated data, create immutable release snapshots, record signatories/template versions, and deliver through private storage and short-lived authorized downloads. Document export/read access without leaking document contents into logs.

Acceptance: school staff reconcile representative exported forms with their approved examples; dates, calculations, layouts, signatures, release versions, and historical values match.

## Section 7 — Operational acceptance and turnover

Gates: **load and recovery verification**, **real staff MFA login and school acceptance**, and, before any real learner data is imported, **privacy owner and approved purposes**. Test the hosted API with at least 27 concurrent teacher sessions and preferably the complete expected staff cohort. Establish latency/error targets with the client. Exercise backup restoration into an isolated project, privilege revocation, incident recovery, deployment rollback, migrations, data retention, and private document recovery. Complete UAT, TAM evaluation, operational runbooks, and staff training.

Automated tests check isolation and version behavior on embedded PostgreSQL. A separate hosted smoke check also verified the real Supabase runtime role, date parsing, 27 concurrent transaction contexts, teacher isolation, version checks, and audit writes, then rolled back every synthetic fixture. These checks do not establish full API throughput, realistic multi-session authentication load, every concurrent locking race, or backup recoverability.
