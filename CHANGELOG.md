# Release history

Each release is one reviewed increment of the manuscript analysis, in the order set by
[the implementation roadmap](docs/roadmap.md). Section numbers match the "What works in
Section …" headings in [README.md](README.md). Versions are recorded in `package.json`;
database changes are listed by their immutable migration number.

| Version | Scope | Migration |
|---|---|---|
| 0.37.1 | The attendance workflow tested end to end through its four screens | — |
| 0.37.0 | `GET /enrollment-counts`: learner counts by grade that name nobody, shown on the Overview | — |
| 0.36.0 | The assessment policy screen: drafts, adoption, binding — no default weights, nothing computed | — |
| 0.35.0 | The roster import screen: preview, explicit duplicate decisions, identical commit | — |
| 0.34.0 | Screens for the reviewed corrections: timeline, grade placement, void and restore, LRN, identity links | — |
| 0.33.0 | The subjects and offerings screen; the shared form no longer loses what is being typed | — |
| 0.32.0 | The follow-up cases screen, and screen tests that drive the real API in a DOM | — |
| 0.31.0 | The attendance section gets its screens: the daily register, monthly consolidation and the absence monitor | — |
| 0.30.0 | The instructional calendar screen: a month at a time, preview and confirm, change history | — |
| 0.29.0 | Corrective migration for the score defects the review reproduced: current-learner access, explicit clearing, privacy journals, column precision | 0022 |
| 0.28.1 | Backend review: upstream identity validation, provisioning transport checks, decimal input fix; open database findings documented | None |
| 0.28.0 | Workspace overhauled: field-level errors, sheets, command palette, the unrecorded mark | — |
| 0.27.2 | The mark as the browser tab icon; `img-src 'self'` for that one file | — |
| 0.27.1 | Square corners, a wider brighter rail, the EDUNEXUS mark as inline SVG | — |
| 0.27.0 | Navy rail, collapsible navigation, top-bar profile, Overview screen | — |
| 0.26.0 | Workspace redesigned: white surfaces, Inter, one line per screen | — |
| 0.25.1 | Dead MFA content-security directive removed from the workspace page | — |
| 0.25.0 | Managers create faculty accounts; service-role key isolated in an Edge Function | — |
| 0.24.0 | Multi-factor authentication removed; sign-in is email and password | — |
| 0.23.1 | Screen render tests, corrected working contract | — |
| 0.23.0 | Learner registration and enrollment screens | — |
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

## 0.37.1 — The attendance screens, driven end to end

The calendar, daily register, monthly consolidation and absence monitor shipped in 0.30.0 and 0.31.0 with only string-render tests, so none of their fetches, reviews or confirmations had ever run. `tests/web-attendance-flow.test.ts` walks the workflow through the real screens against the real API, in the order a school would.

The manager configures five classroom days and a weekend on the calendar. The adviser marks a class, and the test checks that an unmarked afternoon stays null, that changing one session carries the untouched one back rather than clearing it, and that a save leaves the adviser on the date they were marking. An unconfigured date offers no chips. The manager then sees a month with unmarked sessions held in draft with the reason spelled out, and submits it once every session is marked. Finally the adviser reads the week back on the monitor as raw counts, with the month shown as submitted.

The school year in the test starts on 25 June so that June is the smallest month that can honestly be submitted. No defect was found. No code, endpoint or schema changed.

## 0.37.0 — The Overview counts learners without reading one

The Overview could not say how many learners were enrolled. Every list under `/enrollments` writes an access row naming each record it returns, and paging 897 enrollments on every dashboard load would bury the privacy audit in its own noise. **`GET /api/v1/enrollment-counts?academic_year_id=`** answers with valid enrollments counted by grade and status. It names no learner or enrollment, so it writes no access row, and it is the only learner read that may skip one. It is a grouped select under the existing enrollment row policy, with no migration, no function and no new error code. A teacher's count covers only the learners they may already read, and the response says so with `scope: "current_access"`. Voided records are not counted.

The Overview gains a *Learners enrolled* tile (*Your learners* for an adviser) and a *Learners by grade* ring, both from that one call.

`tests/enrollment-counts.test.ts` checks the counts by grade and status with a voided record left out, the teacher scoping and the refusal of suspended and outside accounts. It checks that neither role's call adds an access row while the paged list beside it adds one. `tests/web-overview.test.ts` loads the real screen as a manager and as a teacher and asserts the access log did not grow.

## 0.36.0 — Assessment policies get a screen

Sections 4A.3, 4A.4 and 4A.5 have had APIs since 0.15.0, 0.17.0 and 0.18.0. `web/screens/Policies.tsx` puts drafts, adoptions and bindings on one manager-only screen, in three cards.

**No number on it is the system's.** A new draft starts with one empty component row and no weights. Every code, name and percentage is typed in from the school's documents, with a source reference saying which. `basisPoints()` turns a typed percentage into integer basis points and refuses a third decimal place rather than rounding it, because a rounding rule is exactly what nobody has supplied. `componentProblem()` checks the API's rules and nothing more, before any request is sent. The weights total is shown because the API requires one of exactly 100%. It is the only sum on the screen, and it is not a grade. Every draft is labelled *Unapproved draft*.

**An adoption is the school's decision, frozen.** Its panel draws the revision as it was adopted, so a later revision of the draft never shows through. **A binding scopes a section subject to one standing adoption that covers its grade.** Withdrawing an adoption that still governs a subject is refused in the sheet with the instruction to release the binding first, and both withdrawal and release are one-way with a reason.

`tests/web-policies.test.ts` has 8 cases, most of them driving the screen against the real API. It confirms that a new draft offers no weights of its own, and that a 90% total is refused without a request. It records 37.5%/62.5% exactly as 3750/6250 basis points, and adopts the draft and shows the adopted revision frozen after the draft is revised. It binds a section's subject, refuses withdrawal while bound, then releases the binding and withdraws the adoption. No migration, endpoint, schema or permission change. The grading gate is untouched, and nothing computes a total, average or grade.

## 0.35.0 — Roster import gets a screen

Section 2B.1's import has had an API since 0.3.0. `web/screens/Imports.tsx` takes a section, a first day and an entry kind, then a CSV chosen as a file or pasted as text. The template can be downloaded from the page header.

**The file never leaves the page until it is previewed.** It is measured the way the API measures it and refused before sending if it is over 24,000 bytes or 50 learners. **Each row is reviewed where it sits**: the server's refusal for a row is printed beside that row's data, and a possible duplicate or occupied LRN opens a decision in the row. The choice is one of the learners already on file, or a different child with a reason that is kept in the receipt. A changed decision marks the preview stale instead of discarding it, since the rows are where decisions are made, and nothing imports until the file is previewed again. **The commit sends the identical reviewed payload**, all rows or none. A retry after a lost response returns the original receipt rather than importing twice.

`tests/web-imports.test.ts` has 11 cases, several driving the screen against the real API. It imports a class and checks both new learners and their enrollments, leaving a blank LRN pending. It shows a rejected row beside its data with no import offered, and resolves a possible duplicate to the learner already on file through a stale-then-fresh preview. It imports a namesake as a different child with the reason kept, reports a wrong header, and refuses a 51-row file without sending it. No migration, endpoint, schema or permission change, and no gate opened.

## 0.34.0 — The reviewed corrections get screens

Five manager-only workflows have had APIs since 0.3.0–0.7.0: LRN correction, enrollment timeline correction, identity links, void and restoration, and grade-placement correction. `web/screens/Reviews.tsx` draws all five, and they open where the records already live. An annual record's panel on the Enrollment screen offers the timeline, grade and void or restore reviews. A learner's panel in the registry offers LRN correction and identity links.

**One shape for all five.** Propose, read the server's own review, then confirm that exact review with its hash. A conflict drops the review rather than retrying it, and every blocking issue code is written as the sentence saying what to fix. LRN correction has no server preview, so the screen draws the old and new numbers side by side before `reviewed: true` is sent.

**Timelines are edited whole and checked first.** A manager changes dates, sections and reasons, removes a movement recorded in error or adds a missed one. `timelineProblems()` marks an impossible entry before any request, and the review sets the record as it is beside the record as it would be. A grade correction maps each section the year passed through to one in the corrected grade, keeps every date, and says it is not a promotion. Voiding offers *entered in error* or *duplicate of an enrollment that is kept*, found through the registry. Linking lets the manager choose which record is kept and review both profiles and every enrollment before confirming. Linked entries are hidden unless asked for, and then offer only reversal.

Each record's histories sit under its panel: movements as first recorded, corrections, void and restore reviews, identity links and LRN corrections.

`tests/web-reviews.test.ts` has 13 cases, most of them driving the screens against the real API. It corrects a movement date and checks that the original movement is still on file. It refuses an impossible timeline without sending it. It corrects a year's grade by mapping sections, voids and restores a record, and voids a duplicate that names the record kept. It corrects an LRN, links and reverses a duplicate identity, and shows the refusal to link away an LRN-bearing record. No migration, endpoint, schema or permission change, and no gate opened.

## 0.33.0 — Subjects and offerings get a screen

Sections 4A.1 and 4A.2 have had an API since 0.13.0 and 0.14.0. `web/screens/Subjects.tsx` puts the subject catalog and each section's offerings on one screen. It is open to advisers for reading, since the API already lets them read the catalog and their own sections' offerings. Adding, offering, editing and history are for managers only.

**An offering keeps the revision it was chosen from, and the screen shows when the catalog has moved on.** Each row shows the subject as chosen, its pinned version and a "Catalog now" badge. The explicit refresh is offered only in a draft year, which is the only time the API allows it. **Offering a subject** lists only available catalog subjects that apply to the section's grade and are not already there, including retired ones. **Grade applicability** is a set of checkboxes, written back as a register would write it — "Kindergarten, Grades 1–3". Nothing on the screen carries a weight, a component or a formula.

**Fixed: the shared form lost what was being typed.** `Editor` reset its values whenever its `fields` or `initial` changed identity, and nearly every screen builds both inline, so any re-render of the parent — a fetch landing, a status update — wiped a half-typed form. The first subject test found it. The form now resets only when the fields or the initial record actually differ, and `tests/web-editor.test.ts` reproduces the old behaviour (it fails against the previous code) and checks that a genuinely new record still resets the form. `Editor` also gained the `checkboxes` field type.

`tests/web-subjects.test.ts` drives the screen against the real API. It adds a subject with grades chosen as a set and checks the stored row. It shows a rejection beside its field. It offers only applicable subjects and pins the revision chosen. It shows a section keeping its revision after a rename, refuses a refresh in an active year and performs one in a draft year. It retires an offering and hides it until retired ones are included. It turns a stale edit into a conflict rather than an overwrite, and gives an adviser a read-only view of the one section they advise. 362 tests across 28 files. No migration, endpoint, schema or permission change, and no gate opened.

## 0.32.0 — Follow-up cases get a screen

Section 3B.4 has had a complete API since 0.12.0 and was the last part of Section 3 without an interface. `web/screens/Followups.tsx` is the manager's queue of attendance follow-up and the only place a case is opened.

**A case is opened from evidence.** The sheet takes a section, a 1–31 date window and a category, then reads the absence monitor filtered the way the database checks that category, so the only learners offered are ones a case could be opened for. That read happens on request, since each monitor read logs the learners it names. Owner, due date and reason go to the preview; confirmation carries the unchanged hash and is disabled whenever there is none.

**What the API refuses is explained first.** A past due date, a second open case for the learner, a window with no matching evidence and an inactive year each get their own sentence. The due-date rules the API reports as one `FOLLOWUP_DUE_DATE` are checked in the client first — an update may keep a date that has already gone by, a new one may not, and closing a case always sends `due_on: null`.

**Opening evidence stands beside the records as they are now.** Changed evidence is explained as something captured having changed, which may be a name or a calendar date rather than a mark, and a learner no longer enrolled in the window is drawn as exactly that, with the case still actionable. The queue filters by year, status, original section, owner and overdue, and names a suspended owner rather than dropping them.

**Screens are now tested through their data paths.** `tests/web-screens.test.ts` renders to a string, where effects never run, so no fetch, review or confirmation had ever been exercised by a test. `tests/helpers/dom.ts` mounts a screen in happy-dom — a new dev-only dependency — and hands it the workspace's own API client pointed at an in-process API over PGlite. `tests/web-followups.test.ts` opens a case through the screen and checks the row in the database, finds a gap-only learner under one category and not the other, shows the open-case refusal with confirmation disabled, resolves a case with its due date cleared, stops a past due date before any request is sent, surfaces a version conflict instead of overwriting, and shows a teacher no queue. These tests import both `web/` and `src/`, so they are type-checked by a third config, `tsconfig.web-tests.json`.

348 tests across 26 files. No migration, no endpoint, no schema and no permission change, and no gate opened.

## 0.30.0 — The instructional calendar gets a screen

Frontend work resumed. Section 3A has had a complete API since 0.10.0 and no interface at all; it is the screen that has to come first, because attendance cannot be recorded against a date the calendar does not describe.

**A month at a time, because the SF2 is a month.** The API reads at most 62 dates and the school's own form is one sheet per section per month, so the register shows one month with arrows bounded by the school year. The window is clamped to the year's start and end, which keeps every read inside the limit without arithmetic anybody has to think about.

**An unconfigured date is drawn.** Both session cells carry the unrecorded hatch and the words "Not configured". This is the entire point of the module: a date nobody has configured is not a holiday, not a school day and not an absence, and a blank cell would have quietly said "nothing happens that day". A test asserts the mark is rendered and that no em dash stands in for it.

**Setting a schedule is the API's own review, drawn.** Pick dates in the register, choose what kind of day it is, and the classification fills the two sessions the way the API requires — a holiday closes both, a suspension suspends both, a regular day teaches — with every session still editable, because the database is what decides and the form is only a convenience over it. Then preview: the panel shows each date's effective schedule now and after, names the ones that change nothing, and confirms with the hash the preview returned. A refusal throws that hash away and sends the manager back to the form. A review is never confirmed against a calendar that moved underneath it.

**Conflicts are explained rather than printed.** `SECTION_OVERRIDES_PRESENT` names the sections holding their own schedule and says to clear those exceptions first; `BASE_DAY_UNCONFIGURED` says to set the school baseline before adding a section exception. A code number tells a school head nothing about what to do next.

**Clearing is offered only where it means something.** In school scope only a school date can be cleared; in a section only that section's own exception can, because clearing is what restores inheritance and a date already inherited has nothing to restore.

The change history reads every calendar change in the year across both scopes, newest first, with the `before_version` cursor — the way to check a change whose response was lost before recording it a second time.

`web/dates.ts` now holds the month arithmetic, and none of it converts a plain calendar date through local time: at 8am in Benguet a locally parsed `YYYY-MM-DD` is still the previous UTC day, which would put the wrong weekday beside every row. Comparisons are string comparisons, which sort correctly in that format. `Column` gained an optional `className`, which is how the selection boxes are dropped from the printed month.

Seven new tests in `tests/web-calendar.test.ts`. 315 tests across 24 files. No migration, no endpoint, no schema and no permission change.

## 0.29.0 — The score corrections the review could not make

The [20 September review](docs/backend-review-2026-09-20.md) reproduced four defects in Section 4B.1 and was forbidden to write a migration. The user authorized one on 21 September. Migration `0022` is that migration and nothing more: it opens no gate, adds no endpoint, no error code and no arithmetic, and every correction restores a guarantee the rest of the system already held.

**A teacher reads only the learners they currently teach.** Record a mark, withdraw the learner, and the former adviser could still read the mark through restricted-role SQL and record a replacement over HTTP, answered 201. The score row policy and the entry function now both apply `can_read_enrollment` — the same predicate daily attendance has used since `0011` — so a departed learner's marks close to their former adviser and stay open to managers, who hold the history. A security-definer function bypasses RLS, which is why the check had to be written twice; `assert_may_grant_role` exists for the same reason.

**Only an explicit null clears a mark.** An entry that simply omitted the `raw_score` key reached the null branch and replaced a recorded 9 with nothing. `jsonb_typeof` of a missing key is SQL null, and `null not in (…)` is null, not true, so the guard never fired. The HTTP schema rejected it all along, but the database is the authority and it accepted it.

**A score read is a disclosure and now says so.** Reading a sheet returns learner names beside their marks and wrote no `record_access_events` row, while every learner and enrollment list in the system writes one. `scoreSheet`, `scoreRecord` and `scoreHistory` are permitted resources and log exactly the enrollments each response named. The three task reads name no learner and log nothing, for the same reason the command palette does not search the registry.

**The documented maximum fits its column.** `max_score` and `raw_score` were `numeric(6,2)`, which stops at 9999.99, so creating a task at the documented maximum of 10000 returned 500. Both are `numeric(7,2)`. The academic meaning of a maximum is still the school's; this only lets the stated bound be stored.

Both writers also take the shared academic-setup lock before reading the row they version-check, rather than after, so a waiting writer cannot proceed on state the transaction ahead of it has already replaced. That ordering is asserted as text: PGlite serializes transactions and cannot show the race, so a real multi-connection regression is still owed before the finding closes.

Five regression cases, one per correction plus the lock ordering. Each of the first four was run against a database built without `0022` and fails there. 308 tests across 23 files, type checks and build pass.

## 0.28.1 — Backend boundary review

Successful upstream identity responses are validated before use: JSON null and malformed identifiers now return controlled service failures. The provisioner reports uncertain external outcomes instead of promising a safe blind retry. Deployed provisioning URLs require HTTPS and reject embedded credentials/fragments. Decimal raw-mark validation accepts ordinary two-decimal inputs such as 1.1 without rounding.

Five new regression cases cover these boundaries and the denial of school access after an external identity call followed by journal failure. The baseline 298 tests passed before changes; all 303 tests, type checks and build pass after the fixes. See [the review](docs/backend-review-2026-09-20.md) for hosted read-only checks, reproduced database defects and test limitations. No migration, endpoint, school policy, frontend change or P17xx error code is added. Corrective database work awaits clarification of the handoff restriction.

## 0.28.0 — The workspace overhauled

The user asked for a complete overhaul of the interface, with the typefaces left
alone. Four settled decisions were kept because they are the user's own and are
recorded with their reasons — the navy rail, the single blue accent, square
corners everywhere, and Inter with JetBrains Mono for identifiers. Everything
above those was rebuilt.

**Errors now have a home.** This was the real defect. The API has always
returned `error.fields[]` with a path and a message per field; `web/api.ts`
joined them into one string and the screen printed that blob in a single status
line at the top of the page. A manager who mistyped a birth date and an LRN was
told both things at once, in one paragraph, a long way from either box. Saving a
form now marks each rejected field, prints the server's own message beneath it,
wires `aria-describedby` and `aria-invalid`, and focuses a summary listing every
problem with a control that jumps to its field. Editing a marked field clears
its mark, because the message described what was there a moment ago. Anything
the server does not attribute to a field — a version conflict, a refusal, a lost
network — still goes to the page line, where it belongs.

**Creating a record is no longer a second form bolted under a list.** Every
screen used to be a table card followed by a permanent "add one" card, which is
the lazy admin layout GOV.UK's own guidance names as the thing not to do. There
is now a `Sheet`: a focus-trapped side panel, opened by a primary action in the
page header, carrying its own status line so a refusal is read where it
happened rather than announced to the page behind it. The invitation panel,
which stacked three whole forms on top of each other, folds each into a
disclosure so the two nobody wanted are out of the way of the one they did.

**`window.confirm` is gone.** Closing a school year is irreversible from the
interface, and a browser dialog cannot say what it costs, cannot be read in the
interface's own words, and can be suppressed outright — which turns an
irreversible change into a silent yes. `Confirm` states the consequence in the
same sentence the screen used, and its two buttons are "Keep as it is" and
"Close year" rather than Cancel and OK.

**There is a command palette on Ctrl/Cmd+K.** Seventeen screens behind six
collapsible groups is a lot of pointing for an adviser who opens the same three
every morning. It searches the route table — label, title, group and
description — and nothing else, and says so in its own footer. That is a privacy
property rather than a limitation: every list under `/learners` and
`/enrollments` writes a `record_access_events` row naming the exact records it
returned, so a palette that searched learners would write one per keystroke and
bury the audit it exists to serve.

**A missing record is drawn rather than left blank.** The rule the whole system
is built on is that absence of a record is not evidence: an unmarked session and
an unentered score are null, never zero. An em dash reads as a value somebody
typed and an empty cell reads as a page that failed to load, so a missing record
now carries a ruled diagonal hatch and says what is missing — "LRN not issued",
"No adviser", "None listed". It is a CSS gradient, because the content policy
serves one image file and drops a `data:` URL. The same mark sizes up: it is the
figure on an empty state, the block on an unbuilt screen, and the ground of the
four struck-out boxes on the Overview that name the general average, attendance
rate, academic standing and class ranking this system may not state, and what
each waits on. Their absence was a decision and now looks like one.

**The frame carries the scope.** The active school year was an 11px grey eyebrow
above the page title; it is the scope every record in the system is filed under,
so it is now a chip in the top bar with its state, ochre when nothing is active.
The rail lost 32px and a block of padding, the type scale gained the steps it
was missing, and the table heading rule is heavier than the row rules the way a
paper register's is.

**The workspace prints.** This school runs on paper — a section list is printed
and carried to a classroom — and printing it previously produced the navigation
rail and a wall of chrome. A print stylesheet drops the furniture, keeps the
register, repeats table headings across pages, avoids breaking a row, and
replaces the hatch with its words, because a diagonal rule does not survive a
greyscale laser.

Smaller, and each one a specific complaint: the password field can be read back,
because mistyping twelve characters twice on a shared keyboard is as real a risk
as the shoulder behind you and only the person at the keyboard knows which they
are in; a loading table is a skeleton shaped like that table rather than three
grey bars; a reason field is a textarea across the full row instead of a
single-line box the width of a two-digit ordinal; an optional field says so;
dates and LRNs no longer break across two lines on a narrow screen, the table
scrolls sideways instead, the way a class list does on paper; and the school
profile reads as a definition list rather than as a form somebody is locked out
of.

Columns are still not sortable, deliberately. Sorting would reorder the
twenty-five rows on screen and leave the other eight hundred where they are,
which looks like an answer and is not one.

`tests/web-shell.test.ts` and `tests/web-screens.test.ts` grew to cover the
palette, the unrecorded mark, and the assertion that no sheet, dialog or
confirmation reaches the markup until it is asked for — an overlay that merely
hid itself with CSS would put the text of a destructive action into the page and
leave its fields in the tab order. The two content-policy traps are unchanged and
still pass: no inline `style` attribute and no image anywhere in the rendered app.

## 0.27.2 — The mark as the browser tab icon

**The workspace now has a favicon**, and it is the school's own mark. 0.27.1
recorded that it could not have one and asked the user to decide whether the
logo mattered more than an unbroken `default-src 'none'`. The user asked for the
favicon, so the policy gains exactly one directive: `img-src 'self'`.

That directive is the whole of the change to the backend control. It admits
same-origin image files and nothing else — no `data:`, no remote host — and this
origin serves only the built bundle, so nothing user-supplied can arrive through
it. The workspace itself still renders no image: the rail mark, the icon set and
every chart remain inline SVG, both because they follow the theme and because a
raster would be wrong at the sizes they are drawn.

The icon is `web/public/favicon.svg`, which Vite copies verbatim into `public/`
and both Express and the Vercel CDN serve at `/favicon.svg`. It is a third cut of
the same geometry as `web/components/brand.tsx` and `docs/brand/edunexus-mark.svg`,
with two changes a 16px tab needs: an opaque white ground, because the navy
mountain and the white pages both disappear against a dark browser theme, and
none of the sub-pixel notches inside the peaks, which only turn to grey mud at
that size. Re-cut the three together. SVG was chosen over an `.ico` so the mark
stays sharp on a high-density display and stays a text file in review.

`tests/foundation.test.ts` now serves the workspace shell and asserts the policy
still starts at `default-src 'none'`, that its `img-src` is `'self'` with no
`data:` or remote origin, and that the page links the icon — so a later
relaxation of the directive has to be deliberate.

## 0.27.1 — Square corners, a brighter rail and the school's own mark

Three requests from the user, all of them to the surface rather than to any
record the system holds.

**Every corner in the system is square.** The four radius tokens are `0`, and the
corners that had bypassed them went with them: the brand tile, the DEV tag, the
legend swatch, and four `999px` pills — the SOON badge, the profile trigger, the
avatar and the loading skeleton. The timeline track, its bars and its today
marker lost their `rx` so the figures match the chrome. The tokens keep their
names so the whole scale still tunes from one place.

**The rail is wider and its blue is more saturated**, 268px to 296px with the
off-canvas drawer moved in proportion. The ramp shifted off the desaturated navy
onto a true blue at the same five depths, and **rail text is now white** —
`--rail-ink` and `--rail-dim` are both `#ffffff`, so navigation labels, group
headings and the school name all read at full strength and hierarchy in the rail
comes from size and weight rather than from dimming the text. `--rail-faint`
stays a step down at `#b9d3f0` for icons and rules, which are not body text.
White is 13.5:1 on the new base and 6.5:1 on the current-page fill, so the
brighter blue costs none of the checked ratios.

**The EDUNEXUS mark replaces the generic school glyph** in the rail, on the
sign-in card and on the account screen. The user supplied it as a PNG, and it
could not be used as one: the workspace policy is `default-src 'none'` with no
`img-src`, so a file, a `data:` URL and a favicon are all dropped silently in
production. Relaxing the policy would have been weakening a backend control for
an interface convenience, so `web/components/brand.tsx` carries a vector redraw
instead — traced from the supplied artwork's own measurements, with its three
colours sampled from the file: navy `#02264d`, blue `#329df0`, sun `#fcb929`.
That is the same reason the icon set and the charts are inline SVG. The original
PNG and an export of the redraw sit in `docs/brand/`; anyone re-cutting the mark
should compare the two. The mark carries its own navy, so `.brand-mark` is now a
white tile — visible as one in the rail, invisible on the sign-in card, where the
mark simply sits on the card as the artwork is drawn. There is still no favicon,
and under this policy there cannot be one.

**One alignment defect fixed in passing.** "Collapse sidebar" sat in the middle
of the rail: a `<button>` centres its text by default and `.nav-label` is
`flex: 1`. It predates this release; the wider rail made it obvious.

Verified the same way as 0.27.0 — server-rendering the real components against
the real built stylesheet and screenshotting the rail and the sign-in card — and
by rendering the redrawn mark against the supplied PNG at each pass. No migration,
no API change; the version moves only so the interface release is nameable.

## 0.27.0 — A navy rail, a collapsible sidebar and a landing screen

A second overhaul against a second reference the user supplied: their own earlier
prototype. The instruction was to take its colour and its shell — the dark
sidebar and the profile in the top right — not its contents.

**The rail is the only dark thing on screen.** Navigation is furniture, so it
gets the deep navy; everything that holds a record stays white on a near-white
canvas. The accent moves from pine green to blue, which is the same hue as the
rail at a lighter depth, so the current navigation item, the primary button and
the chart ramp are one colour seen at four strengths rather than four decisions.
Rail text has its own tokens checked against the rail rather than against white,
because `--ink-500` on navy is unreadable and would have been an easy mistake.

**The sidebar collapses two ways.** Each group heading is a button that folds its
items away; collapsing the group holding the current page is allowed, and a dot
on the heading says where you are so the rail never loses your position. The rail
itself also collapses to a 76px icon strip. Both preferences live in
`sessionStorage` beside the session, because a staffroom machine is shared and
one person's layout should not greet the next.

**The identity block moved to the top bar**, which now carries the active school
year, the page title and a profile menu holding sign-out. That also fixes the
accessibility defect 0.26.0 patched by hand: sign-out can no longer be scrolled
out of reach behind a seventeen-item list, because it is not in the list.

**There is no notification bell.** The prototype has one. Nothing in this system
may raise an alert — the absence-alert gate blocks any messaging on attendance —
so a badge would be decoration imitating a signal, and it was left out.

**A new Overview screen** is the landing page: a greeting, four counted tiles,
the school year drawn with its reporting periods and today marked, sections by
grade as a ring, the section-and-adviser list, and the latest recorded changes.

Its numbers are the part worth explaining. The reference prototype led with a
general average of 88.4, an academic-standing ring and a 97.6% attendance rate.
None of those may exist here: grade arithmetic waits on the school's grading
enclosure, and attendance counts are raw session counts until the mark-meanings
gate opens. The screen keeps the layout and fills it with facts the system is
allowed to state, then says plainly in a closing callout that no average,
attendance rate, standing or ranking exists anywhere — so their absence reads as
a decision rather than an oversight.

**The Overview reads no learner record at all.** Every list under `/learners` and
`/enrollments` writes a row into `record_access_events` naming the exact records
returned. A dashboard that counted 897 enrolments per load would write nine such
rows per visit, each carrying a hundred learner IDs, and bury the privacy audit
under its own noise. The tiles are built from years, periods, sections, staff and
the audit log instead.

**Charts are hand-drawn SVG**, in `web/components/figures.tsx`. This is forced,
not stylistic: under `default-src 'none'` a library that rasterises to a canvas
or injects a background image has nothing to draw into, and one that sizes bars
with `style={{ width }}` is dropped outright. SVG geometry attributes are not
inline styles and are unaffected, so every data-dependent dimension is one.

**Both content-policy traps are now tested.** `tests/web-shell.test.ts` renders
the shell and every route and fails on any inline `style` attribute, any `data:`
URL and any `<img>`. Each of those shipped once and neither was visible in
development, which is exactly the class of bug a rendered-markup assertion
catches and a typecheck cannot.

Verified by server-rendering the real components against the real built
stylesheet and screenshotting the rail, the collapsed rail, the mobile drawer,
the profile menu and the sign-in card at 1440px and 390px. No signed-in browser
pass has happened yet, so the data paths behind a fetch remain untested.

## 0.26.0 — A workspace that reads like the system it is

The interface was rebuilt against a reference the user supplied: a professional
administrative product, mostly white, organized so that a screen states what it
is in one line and then gets out of the way.

**White, not dark.** The dark green rail is gone. Surfaces are pure white on a
near-white canvas, separated by hairlines rather than shadow, so the records are
the darkest thing on screen — which is the right hierarchy for a system whose
whole content is rows of learner data. Pine green survives as the single accent,
recalibrated to carry text contrast on white; it is the one deliberately
non-default choice in the palette, and it keeps the institutional colour the
project started from.

**One type family, and a second one that earns its place.** Source Sans 3 and
the Source Serif 4 display face are replaced by Inter, which is the neo-grotesque
the reference uses. Identifiers — LRNs, school IDs, audit table names — are set
in JetBrains Mono, because a twelve-digit LRN is transcribed from paper by hand
and `0`/`O` and `1`/`l` have to be distinguishable. Both are variable fonts, so
the whole type system is two files and 80 KB, against 135 KB for the four static
faces it replaces. Still self-hosted; nothing reaches a font CDN.

**Less prose per screen.** Every route description is now one clause. The page
header carries the title, that clause, and the DepEd form the records end up on
— nothing else. The four-fact mono "record strip" is gone: the table name was
developer detail, the access level is already answered by the navigation hiding
what a teacher cannot open, and the scope field was never populated. Card
headings lost most of their explanatory paragraph; what survived is the handful
of sentences that state a rule a staff member cannot otherwise discover.

**Two structural fixes came out of the redesign rather than the styling.**

A table row now opens into a panel spanning the full width of the table, instead
of a `<details>` disclosure inside the last cell. Those panels hold six-field
editors; a 260px cell was never enough room for one. And a learner now reads as
a name over its LRN in the same cell, the way a class list prints, which removes
a column and keeps the pending-LRN warning visible.

**Two content-policy violations were found and fixed on the way.**

The policy is `default-src 'none'`, tightened in 0.25.1. Every screen had been
using inline `style={{ … }}` props for dividers and field widths, which
`style-src 'self'` silently drops in the deployed app while they work perfectly
under the Vite dev server. They are all classes now. The redesign then nearly
reintroduced the same class of bug from the other direction, with a `data:` URL
chevron on selects; there is no `img-src` at all, so every `<select>` now goes
through a `Select` primitive that draws its chevron as an inline SVG.

Navigation icons are drawn inline in `web/components/icons.tsx` rather than
pulled from an icon package — seventeen glyphs do not justify a dependency, and
an inline SVG needs no extra origin in the policy.

Three accessibility defects were corrected: navigation group labels and the
"soon" tag were set in a grey reserved for icons and failed the 4.5:1 text
minimum; the rail's identity block and sign-out could be scrolled out of reach
behind a seventeen-item list, and now sit in a fixed frame while only the
sections scroll.

No API contract changed. The OpenAPI document moves to 0.26.0 with the same 80
operations and the same descriptions.

## 0.25.1 — A content policy that matches the code

Removing multi-factor authentication in 0.24.0 left the workspace page asking
for a permission it no longer needs. Its `Content-Security-Policy` still
carried `img-src data:`, which was there for exactly one reason: the enrollment
step rendered the authenticator QR code as a data URL. That step no longer
exists.

The workspace renders no images at all — no `<img>`, no background image, no
favicon, only self-hosted fonts — so images now fall back to `default-src
'none'`. The one remaining producer of a data-URL image in the bundle is the
`mfa.enroll` path inside `@supabase/auth-js`, which EDUNEXUS never calls.

The comment above the header explained the policy by naming the QR code. It now
explains why nothing relaxes the policy for images instead, so the next reader
is not left looking for an image that is not there.

No API contract changed.

## 0.23.1 — Tests for the screens, and a contract that matches the code

Two defects found by auditing the repository against itself after the full
manuscript read.

`AGENTS.md`, the working contract both Claude Code and Codex read, pointed at
`web/ui.tsx` and named `OffsetPager` and `Action`. None of the three has existed
since 0.22.0, when the file became `web/components/primitives.tsx` and those
components became `Pager` and `Button`. A working contract that names files
which are not there is worse than no contract, because it is followed. The same
error sat in the frontend handoff.

The interface also had no automated tests at all, against 272 for the backend.
`tests/web-screens.test.ts` now renders every route once for a manager and again
for a teacher, checks the route table stays coherent, and asserts that no column
or field is labelled with a computed grade, since grading arithmetic is gated.
It catches a crash on first render, which a typecheck cannot. Effects do not run
in a server render, so it does not reach the data paths behind a fetch; a
signed-in browser check is still the only thing that does.

Vitest now compiles JSX, and the web test is typechecked by the web project
rather than the backend one, which uses a different module resolution.

## 0.23.0 — Registering learners and recording movements

The registry had no way to put anything in it, so every screen downstream had
nothing to work with. A manager can now register a learner, correct their
details, fill a pending LRN, enrol them into a section, and record the dated
movements that follow.

Registration keeps the rules the API enforces visible rather than hidden. A
learner with no LRN yet is left blank instead of given a placeholder, and the
field explains that EDUNEXUS never invents one. Assigning an LRN is offered
only while it is still pending, and the form says it cannot be cleared or
replaced afterwards.

Movements are a dated form rather than a set of buttons, because which fields
they need depends on what happened: a withdrawal records a reason and no
section, while a move or a re-entry records a section and no reason. The
section list offers only the same grade in the same school year, which is all
the API accepts, and the date field says plainly that it is the first day of
the new state. Movement history is shown as evidence and cannot be edited.

Voided records are visible but closed to further movement, and a closed school
year is read-only throughout.

Both screens end with a note listing the reviewed workflows that exist in the
API but still have no interface, so a walkthrough does not leave the impression
that a missing screen means a missing capability.

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
