# Information requests for Balili Elementary School

Every remaining EDUNEXUS backend module is blocked on a decision or document the school holds. This file tracks those requests: what to ask for, why, what it unblocks, and what a sufficient answer looks like. The gates themselves are defined in [constraints](constraints.md); this is the operational side of opening them.

Update the status column as answers arrive, and record the resulting decision in the settled-decisions table in [constraints](constraints.md).

## Priority

Ask in this order. Request 1 alone unblocks roughly ten increments and is the critical path; it is also the slowest to answer because it depends on documents the school may have to retrieve. Send it first and separately rather than waiting to bundle everything.

| # | Request | Unblocks | Status |
|---|---|---|---|
| 1 | Grading enclosure and ECR examples | Score entry, arithmetic, MPS, GWA, finalization, promotion, SF9, SF10 | Not sent |
| 2 | AM/PM mark meanings and half-day rules | SF2, SF4, alternative-delivery conversion | Not sent |
| 3 | Blank approved form templates and signatories | SF2, SF4, SF9, SF10 rendering and release | Not sent |
| 4 | Kindergarten assessment policy | Kindergarten reporting | Not sent |
| 5 | Learner fields and class capacity | Registry acceptance and promotion capacity | Not sent |
| 6 | Privacy owner and approved purposes | Importing any real learner data | Not sent |
| 7 | Staff MFA enrollment and acceptance testing | Section 1 sign-off, Section 7 turnover | Not sent |
| 8 | Design review of the ERD and the workspace | Closing User Design in the paper's own terms | Not sent |
| 9 | Confirmation of cloud hosting | Recorded deployment decision | Not sent |

## Request 8 — Design review of the ERD and the workspace

**Why:** the methodology makes the database design and the interface prototypes reviewable deliverables, approved by the school head, administrative officers and teachers, with revisions until they agree. Neither has been through that review.

**Ask for:** a session where the school walks through [the ERD](erd.md) and the deployed workspace, and says what is missing, misnamed or wrong. Record what they ask to change.

**Sufficient answer:** an approval, or a list of changes, attributable to named staff on a date.

## Request 9 — Confirmation of cloud hosting

**Why:** the paper says the deployment approach is decided with the client. EDUNEXUS runs on Vercel and Supabase because the operator chose that; the school has not confirmed it, and it is inseparable from where learner data physically sits.

**Ask for:** confirmation that cloud hosting is acceptable, or the constraint that would require a local deployment instead. This belongs in the same conversation as the privacy owner in Request 6.

## Handling what comes back

**Filled ECR files and form samples contain real learner names and grades.** Ask for them with learner names and LRNs removed, or replaced with placeholders. What EDUNEXUS needs from a sample is the structure, the formulas and the resulting numbers, not the identities. If the school can only supply unredacted copies, treat them as real learner data: they fall under request 6, and they must not be committed to this repository or pasted into any issue, chat or deployment log.

Keep every supplied document in the ignored local working area, never in version control. Record only the decision it produced.

## Request 1 — Grading enclosure and ECR examples

**Why:** the manuscript describes Written Works, Performance Tasks and Quarterly Assessments with transmutation, but its bibliography cites the June 2026 revised grading order, and DepEd separately issued an April 2026 three-term calendar order. EDUNEXUS cannot tell from the paper which rules apply to the target school year, and inventing them would silently produce wrong report cards.

**Ask for:**

- Which DepEd grading issuance the school is following for the target school year, by number and date.
- Its enclosure — the part that gives component weights per learning area and grade level, and the transmutation table.
- Two or three completed Electronic Class Records, one per grade level if they differ, with learner identities removed. A real one matters more than a blank template, because it shows the formulas and the rounding actually in use.
- How a missing score is treated: excused, zero, or excluded from the total.
- Whether the school year runs on quarters or the three-term calendar, and how many reporting periods per year.

**Sufficient answer:** enough to reproduce one learner's quarterly grade in one subject, by hand, and get exactly the number the school's own ECR shows — including the rounding at every step.

## Request 2 — AM/PM mark meanings and half-day rules

**Why:** EDUNEXUS records morning and afternoon attendance separately and deliberately counts raw sessions. Turning those into official SF2 and SF4 totals needs the school's own rules, and guessing would misstate a learner's attendance record.

**Ask for:**

- What one morning mark and one afternoon mark mean for a day's attendance: does present-morning-absent-afternoon count as half a day, a full day, or an absence?
- How a school day is counted when only one session is held.
- The rule for a learner who transfers in or out mid-month: which day is their first or last counted day.
- How alternative-delivery participation converts to attendance, if at all.
- Who approves a monthly SF2 before it goes to the administrative officer, and what happens when a correction arrives after submission.

**Sufficient answer:** enough to compute a month of SF2 totals for one section by hand and match the school's own submitted form.

## Request 3 — Blank approved form templates and signatories

**Why:** EDUNEXUS must render forms the school can actually file, not an approximation. Release versions and signatories also have to be recorded so a reprinted form matches what was originally issued.

**Ask for:** blank current SF2, SF4, SF9 and SF10 templates as used now; who signs each; and what the school does today when an already-issued form needs correcting.

## Request 4 — Kindergarten assessment policy

**Why:** EDUNEXUS stores Kindergarten as grade level `0` and applies no numeric grading to it. Kindergarten uses descriptive assessment, and applying a Grade 1–6 numeric policy to it would be wrong.

**Ask for:** the checklist or descriptive instrument in use, how it is reported to parents, and whether Kindergarten appears in SF9 and SF10 in a different form.

## Request 5 — Learner fields and class capacity

**Why:** the registry stores a deliberately minimal profile. Before real enrollment the school should confirm nothing required is missing, and promotion needs capacity rules.

**Ask for:** any learner field the school needs that EDUNEXUS does not store; maximum class size per grade; whether sections are balanced by any attribute the school has authorized; and who decides section assignment.

## Request 6 — Privacy owner and approved purposes

**Why:** education records are sensitive personal information under the Data Privacy Act. This has to be settled before any real learner record is imported, not after.

**Ask for:** who at the school is accountable for learner data; the approved purposes and the fields approved for each; how long records are retained; who may access what; and acknowledgement that hosting is on Supabase and Vercel.

**Sufficient answer:** a named person, a written scope, and a tested restore of a backup into an isolated project before the first real import.

## Request 7 — Staff MFA enrollment and acceptance testing

**Why:** an invited administrator identity exists but no real person has completed password and authenticator setup, so an end-to-end authenticated login has never been proven. Section 7 also needs at least 27 concurrent teacher sessions.

**Ask for:** a scheduled session with the school head or administrative officer to complete enrollment and sign in once; agreement on acceptable response time and error rate; and a date when enough staff can be online together for a realistic load test.

**Note:** authenticator reset is currently an operator action in Supabase, not something the school can do in the app. Agree who performs it and how a staff member requests it, and write that into the operational runbook.

## What the school does not need to decide

To keep the requests short, these are already settled and should not be reopened unless the school raises them: principals and administrative officers manage learner records while teachers see only their currently assigned learners; one adviser per section; attendance marks are recorded as observed and never inferred; and there is no automatic absence alert, because the school confirmed it has no approved threshold.
