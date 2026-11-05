# An adviser's own class roster, and school-wide encoding oversight

Phase 2 steps 6 and 7, shipped together in 0.90.0 (migration `0054`). Two
separate features; they share nothing but the academic lock and this file.

Step 8, the batch SF10, is **deferred** by instruction and untouched.

---

## Step 7 — an adviser builds their own class

### This reverses a settled rule, and the reversal is the decision

Since `0004` the rule has been: managers change learner records, teachers read
only the learners in the classes they advise. One exception was added on
2026-11-03 for historical encoding. The 0.42.0 `constraints.md` additionally
recorded that *"a teacher-accessible unassigned pool is not implemented"*, and
the roadmap's own step 7 said a pull **must stay a request** that a manager
approves, reusing `roster-submissions`.

The user decided on 2026-11-05 that the adviser does it directly. That is
recorded in [constraints.md](constraints.md) with its date and its limits, and
`roster-submissions` remains for an adviser who prefers to submit a list.

### What widened, exactly

| | |
|---|---|
| Always **a section they advise**, in a year that is not closed | `may_advise_section` is the single predicate, and every new path goes through it. A manager passes it for any section |
| Taking a learner in only ever **gives a class to an enrolment that has none** | Moving a learner out of a colleague's class, withdrawing and re-entering stay a manager's movement |
| Registering refuses a **name and birth date already on the registry** | An adviser cannot search the registry to check, and two records for one child means two SF10s with no way to tell which is the record |
| **Nothing else** | No profile correction, no LRN, no grade change, no withdrawal, no deletion |
| **The read scope never widened** | Row security is untouched. A teacher still reads only their own classes |

```
GET  /api/v1/sections/:id/pullable-learners   who is waiting; logged
POST /api/v1/sections/:id/pulls               take one in
POST /api/v1/sections/:id/learners            register a new one into this class
```

### There is no second enrolment path

Both writes go through `place_enrollment` and `move_enrollment` — the same two
writers the registry form, the roster import and next year's placement use. Each
was replaced in `0054` with **one authorisation line changed** and its `0048`
signature intact, so the LRN rule, the date rules, the one-enrolment-a-year
index, the version check and the `enrollment_events` journal are the same ones,
not a set written for teachers.

`place_enrollment` allows an adviser when a section is given and they advise it;
with no section it stays manager-only, because an enrolment with no class
belongs to no adviser. `move_enrollment` allows an adviser only
`action='reassigned'` into a section they advise, on an enrolment whose
`section_id` **is null**.

### Who is offered, and why so narrowly

`read_pullable_learners` lists the learners registered for that section's school
year **at its grade, with no class yet** — which is exactly what the
registry-first import of 0.89.0 produces. An optional search of two characters
or more additionally finds a learner with **no enrolment this year at all**, so a
returning learner can be taken in without the office keying them again; without
a search that group is not listed, because a bare list of every learner the
school has ever held is not an adviser's to read.

This names learners outside the adviser's own class. That is the feature's cost,
so every call writes a `record_access_events` row (`pullableList`) naming exactly
the records it returned, as does every write here (`learnerPull`,
`learnerRegister`). The oversight read of step 6 appears nowhere in that log
because it names nobody.

### The trap: a branch on records the caller cannot read

Deciding *which* of the two writes applies cannot be done in the service layer,
and the first test run proved it.

An adviser **cannot see** an unplaced learner's enrolment —
`visible_learner_identity` answers null for exactly that caller, which is
correct. So a service-layer lookup under row security found nothing, took the
"not enrolled" branch, and asked `place_enrollment` to create a **second
enrolment for the same learner in the same school year**. Only the unique index
caught it.

The decision now lives in `pull_learner_into_section`, a security-definer
function that re-checks the policy it bypasses, and reads which write applies
**from the records rather than from what the caller says** — so a stale list
cannot turn an assignment into a second enrolment either. The general rule is in
`constraints.md`: when a write must branch on records the caller may not read,
the branch belongs in the definer function, and a service-layer lookup that
returns nothing for an authorised caller is a symptom, not a null case.

### Refusals

| Code | |
|---|---|
| `P2600` `NOT_YOUR_CLASS` | Not a section the caller advises |
| `P2601` `LEARNER_ALREADY_ON_REGISTRY` | A learner of that name and birth date is on the registry already — take them in instead |
| `P2602` `LEARNER_IN_CLASS` | Already in a class this year; a manager moves a learner between classes |
| `P2603` `LEARNER_OTHER_GRADE` | Registered at another grade this year |
| `P2604` `VERSION_CONFLICT` | The list was stale: read it again and take them in from it. This is what stops two advisers both claiming one unplaced learner |

### The three capabilities coexist

Required explicitly, and tested: an adviser may take learners in, register new
ones, **and** encode the historical academic records of the learners in their
classes (the 2026-11-03 exception, now reachable through a pull —
`tests/teacher-roster.test.ts` walks exactly that path and then checks the
adviser still cannot read a colleague's learner).

---

## Step 6 — the office oversees the historical encoding

The one unmet requirement of the 4 November brief: administrators must *"oversee
historical encoding progress across the entire school"*, while Academic history
was per-learner only — reached by searching for one child, with no way to see
which of 30 classes still had work.

`GET /academic-years/:id/encoding-progress` (`read_encoding_progress`) counts,
for every section of a year: the learners it holds, how many have an encoded
previous school year, how many have the Grade 1 credential, how many have
**neither** — the work left — the years encoded, and the adviser's name.
Learners registered at a grade with no class yet are counted on their own, so
the school total is the whole school rather than only its placed part, for the
same reason the SF4 reports its unplaced learners (`0052`).

It is **Across the school** above the learner finder on Academic history, for
managers only (`web/screens/EncodingProgress.tsx`).

### Counts only, and that is the design

It **mirrors `read_grade_entry` (0035) deliberately**: no learner named, no
rating read, and **no `record_access_events` row written**.

Every list under `/learners` and `/enrollments` writes an access row naming the
exact records it returned. A school-wide progress view built by paging the
registry would therefore write one such row per section per refresh, and bury
the privacy audit in its own noise — the rule the Overview has followed since
0.27.0. So this view trades names for frequency: it can be watched as often as it
is useful, and a manager who needs a name opens the learner, which logs that read
as it should.

`tests/web-teacher-roster.test.ts` asserts the access-event count **does not
move** when a manager opens it, because that is the property that would rot
silently.
