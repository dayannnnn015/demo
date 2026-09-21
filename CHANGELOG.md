# Release history

Each release is one reviewed increment of the manuscript analysis, in the order set by
[the implementation roadmap](docs/roadmap.md). Section numbers match the "What works in
Section …" headings in [README.md](README.md). Versions are recorded in `package.json`;
database changes are listed by their immutable migration number.

| Version | Scope | Migration |
|---|---|---|
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
