# Release history

Each release is one reviewed increment of the manuscript analysis, in the order set by
[the implementation roadmap](docs/roadmap.md). Section numbers match the "What works in
Section …" headings in [README.md](README.md). Versions are recorded in `package.json`;
database changes are listed by their immutable migration number.

| Version | Scope | Migration |
|---|---|---|
| 0.22.0 | Workspace design system, grouped navigation, honest placeholders | — |
| 0.21.0 | Workspace rebuilt on Vite + React | — |
| 0.20.0 | Section 4B.1 — assessment tasks and raw score entry | 0021 |
| 0.19.0 | Staff invitations and account recovery | 0020 |
| 0.18.0 | Section 4A.5 — assessment-policy offering binding | 0019 |
| 0.17.0 | Section 4A.4 — assessment-policy adoption | 0018 |
| 0.16.0 | Workspace: read-only Section 2A learner registry | — |
| 0.15.0 | Section 4A.3 — assessment-policy drafts | 0017 |
| 0.14.0 | Section 4A.2 — section subject offerings | 0016 |
| 0.13.0 | Section 4A.1 — subject catalog | 0015 |
| 0.12.0 | Section 3B.4 — manual attendance follow-up | 0014 |
| 0.11.0 | Section 3B.3 — classroom absence monitoring | 0013 |
| 0.10.0 | Section 3B.2 — monthly attendance review and locks | 0012 |
| 0.9.0 | Section 3B.1 — daily classroom attendance | 0011 |
| 0.8.0 | Section 3A — instructional calendars | 0010 |
| 0.7.0 | Section 2B.5 — grade-placement correction | 0009 |
| 0.6.0 | Section 2B.4 — annual record void and restoration | 0008 |
| 0.5.0 | Section 2B.3 — learner identity reconciliation | 0007 |
| 0.4.0 | Section 2B.2 — enrollment timeline correction | 0006 |
| 0.3.0 | Section 2B.1 — roster import and LRN correction | 0005 |
| 0.2.0 | Section 2A — learner registry and enrollment | 0004 |
| 0.1.0 | Section 1 — staff authorization, school setup, workspace | 0001–0003 |

## 0.22.0 — A workspace staff can be walked through

The interface was functional but plainly a developer's harness, and the TAM
evaluation measures the interface rather than the API. This turns it into
something a teacher or an administrative officer can be sat in front of.

A design system replaces ad-hoc styling: tokens for colour, type, spacing and
elevation; Source Serif for titles and Source Sans for everything else, both
self-hosted so no staff IP reaches a third party and the policy stays
same-origin. The palette comes from the school's own world, pine for the
institution and bond paper for surfaces, with ochre carrying "needs attention"
so red stays rare and always means blocked.

Navigation is grouped the way the school works — Setup, Learners, Attendance,
Academics, People — rather than by API module, and the address bar follows the
screen so a refresh lands where you were. Every module appears, including the
ones with no interface yet: each states what it will do and, where it applies,
what it is waiting on, so a walkthrough shows the shape of the finished system
instead of hiding the gaps.

Each screen carries a record strip naming the record it holds and the official
form it feeds, because staff navigate by form number rather than by table name.
Tables echo the ruled registers these records come from, with tabular numerals
and a header that stays put down a long roster.

Empty states say what to do next, errors say what went wrong, and the
navigation collapses behind a menu on a phone.

## 0.21.0 — Workspace rebuilt on Vite + React

The hand-rolled DOM workspace was fine for Section 1, but the screens still to
build are batch grids with per-row optimistic versions and review-then-confirm
flows. This replaces it with a Vite + React + TypeScript app in `web/`, built into
`public/` and served by the API at `/app`.

Nothing was dropped: sign-in, invitation completion, authenticator enrollment and
verification, password recovery, school profile, years, periods, sections, staff
access, activity history and the read-only learner registry all carried over. A
staff invitations screen is new, covering the workflow added in 0.19.0.

Sessions now live in `sessionStorage`, so a refresh no longer forces a full
re-login including MFA, while closing the tab still ends the session. In-memory
sessions were unusable for a teacher recording attendance twice a day, and
`localStorage` would leave tokens readable by any script on the page.

Static bundle files are now served before the CORS middleware. A `type="module"`
script is always fetched in CORS mode, so the API origin allowlist was rejecting
the workspace's own bundle; those files are public and carry no credentials, so
gating them achieved nothing.

## 0.20.0 — Assessment tasks and raw score entry

Teachers can record the marks they actually give: a named assessment with a maximum,
and one raw score per learner. Both facts hold under any grading policy, which is why
this could be built while the grading gate is still closed.

A task takes its component code from the bound adopted policy revision rather than
inventing one, so an offering with no standing binding cannot hold assessments. That
makes the draft, adoption and binding chain load-bearing.

Marks are written in batches of up to 100, each entry against its own version, so two
teachers editing different learners do not conflict. An unrecorded learner stays null
rather than zero, clearing preserves history, and lowering a maximum below a recorded
mark is refused. One journal row is written per batch rather than per learner.

Nothing is summed, weighted, averaged, converted to a percentage, transmuted or turned
into a grade, and no endpoint returns a total. Those rules come from the school and sit
behind the grading enclosure and ECR examples gate in docs/constraints.md.

## 0.19.0 — Staff invitations and account recovery

Authorizing a colleague meant an operator inviting them in the Supabase dashboard
and someone pasting the returned UUID into a form, with nothing recording who asked,
what permission level was intended, or whether a pending request had been fulfilled.
Invitations are now tracked records with an immutable journal.

A manager requests an email, display name and permission level. The operator creates
the Auth identity in Supabase. A manager then links that identifier, which creates the
staff row and completes the invitation in one transaction, so school access and the
invitation record cannot disagree. One open request per email; completion and
cancellation are terminal.

EDUNEXUS still never creates an Auth identity. That would need a service-role key in
the runtime, which could create, alter or delete any identity in the project including
principals, and which readConfig rejects by design. An unknown identifier fails the
foreign key and the whole transaction rolls back.

Account recovery is initiated from the sign-in page by the browser against Supabase
with the publishable key, and answers identically whether or not an address is
registered. Authenticator reset needs the admin API and remains an operator action.

## 0.18.0 — Assessment-policy offering binding

An adoption says the school stands behind one policy revision for one school year;
it does not say where that revision applies. Binding is that statement: a manager
records that a standing adoption governs one section subject offering.

Binding requires current offering and adoption versions, one shared school year, an
active offering, and a section grade the adopted revision applies to. One standing
binding exists per offering; release is a reviewed one-way action and an offering can
be bound again afterwards, including to a different adoption.

A standing binding is a live statement, so the records underneath it cannot be pulled
away: migration 0019 replaces the 4A.4 adoption writer and the 4A.2 offering writer so
withdrawing a bound adoption or retiring a bound offering is refused until the binding
is released. Migrations 0016 through 0018 are unchanged.

Still no score entry, component arithmetic, rounding, transmutation, MPS, GWA or
computed grade at any endpoint. Those wait on the grading enclosure and ECR examples
gate in docs/constraints.md.

## 0.17.0 — Reviewed assessment-policy adoption

Adds manager-only records that the school adopted one exact unarchived
[assessment-policy draft](docs/assessment-policy-drafts.md) revision for one school
year. The whole revision is copied into a frozen snapshot, so later draft edits
advance the draft's own history without changing what the school decided.

A partial unique index permits one standing adoption per school year and policy;
withdrawn rows stay as evidence, so the same policy can be adopted again. Withdrawal
is a reviewed one-way action requiring the current adoption version — nothing edits an
adoption in place. Migration 0018 also replaces the Section 4A.3 draft writer so an
adopted draft cannot be archived until its adoption is withdrawn, leaving migration
0017 unchanged.

Adoption records a school decision and nothing more: no section subject offering is
bound, no score is accepted, and no grade, average, MPS, GWA or transmutation is
computed. `adoption_reference` is the school's own record of the decision, supplied as
text, and is not proof that the content is correct or approved.

## 0.16.0 — Read-only learner registry in the workspace

Adds a Learners tab to `/app` for every role, built on the existing Section 2A read
endpoints. Scoped search by name, exact LRN or birth date; 25 rows per page; each
learner's annual enrollment records load only when a staff member opens that row,
because every successful read appends a record-access event.

No backend change: no migration, no new route, no contract change and no mutation path.
Teachers receive only their currently assigned learners from the API, and the page says
so. Pending LRNs read `Pending`, Kindergarten is named rather than shown as grade `0`,
and voided records stay labeled as unusable for reporting.

Registration, enrollment, movement and every reviewed correction workflow remain
API-only until their review screens exist.
