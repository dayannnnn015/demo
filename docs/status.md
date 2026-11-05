# Where things stand

**Version 0.90.1.** Branch `branch-out`, from `80d8d7c` (the recovered 0.86.1).
**Committed on this branch only. Not merged anywhere, by instruction** — the
user merges.

[docs/constraints.md](constraints.md) is the authority. The decisions table this
file used to carry lives there; this file is a pointer, not a second changelog.

## The single next action

**Commit this tree, then apply migrations 0053 and 0054 and deploy 0.90.0.**
Both are the user's.

The live database is at **0052** and the deployed app is still **0.86.1**, so
nothing from 0.87.0 onwards is on live. **Apply both migrations before
deploying.** 0053 is purely additive. 0054 replaces `place_enrollment` and
`move_enrollment` with one authorisation line changed in each and their 0048
signatures intact, so the running 0.86.1 behaves identically under it — a
manager still passes every check exactly as before.

> **The caution from the earlier session still stands.** 0049 replaced
> `commit_next_year_placement` to ignore any section on an entry and enrol with
> none, while the deployed 0.86.1 screen still draws learners into sections and
> sends them. **Do not open Next year's classes on live until this ships.**

## What shipped in this session

### 0.90.1 — every control says when it is waiting

The school reported **a delay when clicking**. The delay is real and is not the
fault: a hosted request over a school connection takes a moment. What made it a
fault is that **nothing said the system was working** — `.btn:disabled` is .45
opacity under a `not-allowed` cursor, so the button a person had just pressed
looked switched off, and the repair for a button that looks broken is to press
it again. In a records system that is the one reaction not to invite.

Three changes, no new behaviour and no API change:

- **Every request is counted at one place.** `onApiBusy` in `web/api.ts`, the
  chokepoint every request already passes. The shell shows **Working…** in the
  top bar once a wait passes **300ms** — held back so it never flashes on a
  fast request, which would itself read as a fault. This is what covers the
  many clicks that open a sheet, refetch a list or reload a screen and have no
  control of their own to speak through.
- **48 acting buttons carry `aria-busy`** beside the progressive label most
  already had, so the stylesheet keeps them at full strength under a
  `progress` cursor. A button disabled because something *else* is running is
  deliberately **not** marked: it is unavailable, not working, and marking it
  would lie to a screen reader. The shared `Button` primitive, which had **no
  busy affordance at all**, and one button on Roster submissions that fetched a
  submission and said nothing while it did, both now say **Working…**.
- **A ghost button keeps a visible edge.** With a transparent border it reads
  as a line of text to anyone who does not already know where the controls are.

Gated by `tests/web-buttons.test.ts` (9 cases). **Every gate was broken on
purpose before being trusted**, and that paid again: the screen-reader-name
gate was **vacuous on its first run** — an icon's own `size={20}` counted as a
label — so it passed on a button whose name had been deleted.

### 0.90.0 — Phase 2 steps 6 and 7 (migration 0054)

Step 8, the batch SF10, is **deferred by instruction and untouched**. Full
account in [an adviser's own class roster](teacher-roster.md).

**Step 6 — school-wide encoding oversight.** The one unmet requirement of the
4 November brief. `GET /academic-years/:id/encoding-progress` counts, for every
section of a year: the learners it holds, how many have an encoded previous
school year, how many have the Grade 1 credential, how many have **neither** —
the work left — the years encoded, and the adviser's name. Learners registered
at a grade with no class yet are counted on their own, so the school total is
the whole school. It is **Across the school** above the learner finder on
Academic history, managers only.

**It reads counts and nothing else** — no learner named, no rating read, **no
`record_access_events` row written** — mirroring `read_grade_entry` (0035),
because every list under `/learners` and `/enrollments` logs the records it
returned and a view built by paging the registry would bury the privacy audit in
its own noise. A DOM test asserts the access-event count does not move when it is
opened.

**Step 7 — teacher pull, which reverses a settled rule.** An adviser may now
take an already-registered learner into a class they advise, and register a new
learner into it. The reversal is recorded in [constraints.md](constraints.md)
with its date and its limits, as the roadmap's own step 7 required, and the
standing rule in `AGENTS.md` and `constraints.md` now reads *three exceptions*
rather than one.

What widened, and nothing beyond it: always a section they advise in an open
year (`may_advise_section`, the single predicate); taking a learner in only ever
**gives a class to an enrolment that has none**, so moving a learner out of a
colleague's class, withdrawing and re-entering stay a manager's; registering
refuses a name and birth date already on the registry; and no profile
correction, LRN, grade change or withdrawal is opened. **Row security is
untouched** — a teacher still reads only their own classes. Both writes go
through `place_enrollment` and `move_enrollment`, so there is no second enrolment
path and no second learner record is ever created.

The three teacher capabilities coexist as required: taking learners in,
registering new ones, and encoding historical records for the learners in their
classes.

### One bug the first test run caught, worth not re-stepping on

Deciding *which* of the two writes applies cannot be done in the service layer.
An adviser **cannot see** an unplaced learner's enrolment —
`visible_learner_identity` answers null for exactly that caller, correctly — so
the lookup found nothing, took the "not enrolled" branch, and asked
`place_enrollment` for a **second enrolment for the same learner in the same
year**. Only the unique index caught it. The decision now lives in
`pull_learner_into_section`, a definer function that re-checks the policy it
bypasses. The general rule is in `constraints.md`.

### Housekeeping, 2026-11-05 — the local scratch cleared

Asked for as a quick cleanup of unused files. **Nothing tracked was removed,
because nothing tracked was unused**: every file under `web/`, `src/` and
`scripts/` is referenced by another file, by a `package.json` script, or by a
document — `scripts/export-erd-schema.ts` looks orphaned and is not, since
[the paper diagrams](diagrams/paper/README.md) runs it by hand — and all six
images in `web/public/images/` are loaded by a screen, which matters because the
image list is closed by the content policy.

What went, all of it gitignored and all of it reproducible:

- **`.local/sf9-print/out/`** — 580 files, nearly all of them three throwaway
  Chromium user-data profiles the print harness creates on each run, plus the
  PNG and PDF proofs from it. The two seals and the wordmark that came out of
  that work are committed in `web/public/images/`, so the proofs hold nothing
  the repository does not. The 13 harness scripts are **kept**: two are cited by
  path in `prior-academic-records.md`.
- **Eight spent one-off scripts in `.local/db/`** — `check-0048`,
  `check-lrn`, `check-phase2`, `check-promotion`, `check-readers`,
  `check-unapplied`, `probe-enrol`, `try-demo`. Each verified something that
  has since shipped with tests of its own, and several said in their own header
  that they live in `.local/` and are deleted afterwards, which is the rule in
  `AGENTS.md`. **Kept**: `applied.ts` and `dry-run.ts` (read-only, and what
  you want before `db:migrate`), `bootstrap.ts` and `verify-live.ts`.
- One stale background probe test (`tests/zz-probe.test.ts`) had already been
  cleaned up by its own run; the shell that wrote it was stopped.

`.local/npm-cache/` is **not** scratch — `.npmrc` points npm's cache there.
Nothing in `.local/` held a credential: it was checked before anything was
deleted.

### Earlier in this session

- **0.89.0** — register every learner first, settle classes afterwards: the
  class-list import takes a year and a grade with no section. Plus the two test
  gates `AGENTS.md` claimed existed, `tests/migrations.test.ts` and
  `tests/web-help.test.ts`, both mutation-tested; the help one was **vacuous on
  its first run** and then found eight stale marks.
- **0.88.0** — the learner's address (migration 0053, one field of the
  learner-fields gate) and the Excel class-list template on Roster import.
- **The bulk historical-records import was built and reverted** at the user's
  direction: not a go-live requirement. Individual encoding on Academic history
  is unchanged and remains the only path.

## Verification

| Check | Result |
|---|---|
| `npm run check` | **passes, exit 0** |
| `npx vitest run` | **199 passed**, 19 files (114 in 11 at the start of the session) |
| `npm run build` | clean |
| `npm run api:export` | regenerated for 0.90.1. **0.90.1 adds no endpoint**: it changes the workspace only |
| Migration checksums | **54/54**, by `tests/migrations.test.ts` — which caught 0054's missing checksum on its first run |
| 0054 in PGlite over every earlier migration | applies clean; all earlier tests pass unchanged against the two replaced writers |
| `npm run db:migrate` | **not run.** Live is still at 0052 |
| `npm run smoke` | **not re-run.** It would show the same routes missing as before, all of them the deployment being 0.86.1 |

New tests: `tests/teacher-roster.test.ts` (23) — mostly refusals, because a
widening tested only for its happy path is how a role gate becomes decoration:
the wrong section, a learner in somebody else's class, a learner at another
grade, a stale version, a duplicate name, a duplicate LRN, and every movement an
adviser still cannot make. Plus `tests/web-teacher-roster.test.ts` (6) driving
both screens in a real DOM against the real API.

## Outstanding

**Blocking**

1. **Commit, then apply 0053 and 0054 and deploy 0.90.0.** **Next year's classes
   must not be opened on live** until it ships.

**Not finished**

2. **`tests/concurrency.pg.test.ts` is still missing**, so `npm run test:race`
   and `npm run test:load` run nothing. 0054 touches two writers that take the
   academic lock; both take it exclusively and first, as before, and neither
   changed its lock order — but that is read by eye, not proved by a test.
3. The recovered 0.42.0 documents are **as of 0.42.0**. `learner-registry.md`,
   `registry-review.md`, `architecture.md` and `frontend-handoff.md` have been
   corrected for the recent releases; `runbooks.md` and
   `school-information-requests.md` only partly, the rest not at all.
4. `guides/staff-guide.md` has **no screenshots** and nothing about the address
   column, the Excel template, registering without a class, the adviser's pull or
   the oversight card. Retake from `npm run demo`, synthetic records only.
5. **Step 8, the batch SF10, is deferred** — do not start it unasked.

**Waiting on the school** (see the gates in [constraints.md](constraints.md))

6. **The reviewed learner-field list and the capacity policy**, sharpened in
   [the information requests](school-information-requests.md) with the candidate
   fields named, to be answered with the privacy-owner request.
7. **Subject-teacher access — integration deferred 2026-11-05 because the role
   itself is unconfirmed.** The user asked for it not to be integrated: the role
   is yet to be confirmed. So the question to the school is now two, in order —
   does it run this role officially, and only then what may it record. Three
   teachers in the school's own SF4 teach classes they do not advise, which is
   evidence of a timetable, not of a role carrying permissions. **The adviser
   pull does not help them, and is not to be stretched into helping them**: it
   is scoped to a section they advise, and a subject teacher advises none.
   Nothing is modelled for the role — no role value, no section-teacher table,
   no second predicate beside `may_advise_section`, no placeholder screen.
8. Whether Balili's head should be pre-printed on the SF9's Cancellation block.
9. Which DepEd order the SF10-ES footer should cite — the school's workbook says
   *DepEd Order No. 10, s. 2024*, the 4 November clarification says **No. 58,
   s. 2017**.
10. The Kindergarten card and assessment policy.
11. `a` on the daily register means *afternoon*, not *absent*. Flagged, undecided.

**Housekeeping**

12. **Done 2026-11-05: the local scratch was cleared** (see below). What is left
    in `.local/` is four read-only database tools and the print harness two
    sections of [prior-academic-records.md](prior-academic-records.md) cite by
    path. Promoting the print harness into `tests/` is still open — it needs a
    headless browser, which the suite deliberately does not.
13. The SF10's front and back row heights differ. Cosmetic.
14. `next_year_placements.seed` is vestigial since 0049.

## The plan from here

[docs/roadmap.md](roadmap.md). **Phase 1 is done. Phase 2 steps 6 and 7 are
done**; step 8 is deferred by instruction and step 8b (the historical bulk
import) is recorded as considered and declined for go-live. So Phase 2 is closed
unless step 8 is asked for. Phase 3 is seven features behind a school decision;
Phase 4 is the Section 7 turnover — drills, hosted load, privacy, go-live, UAT.

**What the school needs for go-live, in order:** register the current learners —
onto the registry at a grade and into classes afterwards, or a class list at a
time, or by an adviser building their own class, or one learner at a time on the
registry — then set the year's calendar and attendance rule, then run the year.
**Historical academic records are not on that list**: they can be encoded at any
time afterwards, the office can now see how far that has got, and nothing waits
on them.
