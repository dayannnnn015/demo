# Release history

Each release is one reviewed increment of the manuscript analysis, in the order set by
[the implementation roadmap](docs/roadmap.md). Section numbers match the "What works in
Section …" headings in [README.md](README.md). Versions are recorded in `package.json`;
database changes are listed by their immutable migration number.

| Version | Scope | Migration |
|---|---|---|
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
