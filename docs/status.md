# Where things stand

Short, current, and rewritten at the end of every session. The durable records are the git history, [CHANGELOG.md](../CHANGELOG.md) and [constraints.md](constraints.md); this file only says where the last session stopped and what to pick up.

**Updated:** 2026-09-19 · **Version:** 0.28.0 · **Last commit:** see `git log -1` · **Branch:** `master`, working tree clean

## Just shipped

**The workspace was overhauled.** The user asked for a complete overhaul of the
interface and said to leave the typefaces alone. Four settled decisions were
kept because they are the user's own and are recorded with their reasons — the
navy rail, the single blue accent, square corners, and Inter with JetBrains Mono
for identifiers. Everything above those was rebuilt. The full account is in
[CHANGELOG.md](../CHANGELOG.md); five things matter for the next session.

**Errors now have a home, and that was the real defect.** The API has always
returned `error.fields[]` with a path and a message per field. `web/api.ts`
joined them into one string and the screen printed that blob in a single status
line at the top of the page, so a manager who mistyped a birth date and an LRN
was told both at once, in one paragraph, a long way from either box. A rejected
save now marks each field, prints the server's own message under it, wires
`aria-invalid` and `aria-describedby`, and focuses a summary listing every
problem with a control that jumps to its field. Only an error the server does
not attribute to a field still goes to the page line.

**Creating a record opens a sheet.** Every screen used to be a list card with a
permanent "add one" card bolted underneath. There is now a focus-trapped side
panel, opened from a primary action in the page header, carrying its own status
line — the page's line is behind it, and a refusal announced there is a refusal
nobody reads. `window.confirm` is gone: `Confirm` states the consequence in the
screen's own words, and its buttons say "Keep as it is" and "Close year".

**A missing record is drawn.** `Unrecorded` renders a ruled diagonal hatch and
names what is absent — "LRN not issued", "No adviser". An em dash reads as a
value somebody typed; an empty cell reads as a page that failed to load. The
same mark sizes up to the figure on an empty state, the block on an unbuilt
screen, and the four struck-out boxes on the Overview that name the general
average, attendance rate, academic standing and class ranking this system may
not state, and what each waits on. That replaced 0.27.0's closing callout.

**Ctrl/Cmd+K opens a command palette** onto all seventeen screens. It searches
the route table and nothing else, and says so in its own footer, which a test
asserts. Searching learners from it would write a `record_access_events` row per
keystroke and bury the privacy audit it exists to serve.

**The workspace prints.** A section list is carried to a classroom on paper, so
`@media print` drops the rail, top bar, filters, pager and actions, keeps the
register, repeats `thead` across pages and prints the hatch as its words.

| Version | What |
|---|---|
| 0.28.0 | Workspace overhauled: field-level errors, sheets, command palette, the unrecorded mark |
| 0.27.2 | The mark as the browser tab icon; `img-src 'self'` for that one file |
| 0.27.1 | Square corners, a wider brighter rail, the EDUNEXUS mark as inline SVG |
| 0.27.0 | Navy rail, collapsible navigation, top-bar profile, Overview screen |
| 0.26.0 | Workspace redesigned: white surfaces, Inter, one line per screen |
| 0.25.1 | Dead MFA content-security directive removed from the workspace page |
| 0.25.0 | Managers create faculty accounts; service-role key isolated in an Edge Function |
| 0.24.0 | Multi-factor authentication removed; sign-in is email and password |
| 0.23.1 | Screen render tests, corrected working contract |

298 tests across 23 files. **All 21 migrations are applied**; this increment adds none and changes no endpoint. The only backend file touched is `src/openapi.ts`, for the version string.

## The school sent three forms

After 0.28.0 and unasked: a blank Grades 4–6 SF9, a blank LIS SF2 for one Grade 3 section, and a **filled** SF4 for July of School Year 2026–2027. They are in `.local/school-files/` and stay there — the SF4 names 33 real Balili staff and, in hidden template sheets, teachers from four other schools.

[school-forms.md](school-forms.md) is the committed record of what they specify. In short: the official SF2 marks and arithmetic are now known, the school is 30 sections and 893 learners against 33 staff, and the form templates gate is most of the way open. **No other gate opened.** The SF9's descriptor table and passing mark are an output scale, not the arithmetic that reaches it, so grading stays shut; its General Average box authorizes nothing. Two contradictions went back to the school rather than being resolved here — the SF2 obliges intervention at five consecutive absences while the settled record says there is no approved threshold, and three teachers on the SF4 teach across sections EDUNEXUS would give them no access to.

Nothing was written to the database. The two things that could be — thirty sections, and the eight Grades 4–6 learning areas — need an authenticated manager, and there still is not one.

## What not to undo

**The two content-policy traps are unchanged and still tested.** No inline
`style` attribute and no image anywhere in the rendered app. The new overlays
and the hatch were built inside that: the hatch is a CSS gradient, the page
behind an open sheet is locked with a class rather than by setting
`document.body.style`, and both overlays render nothing at all when closed —
one that merely hid itself with CSS would put the text of a destructive action
into the page and leave its fields in the tab order. `tests/web-screens.test.ts`
asserts that.

**Table columns are still not sortable, deliberately.** Sorting a paged list
reorders the twenty-five rows on screen and leaves the other eight hundred where
they are, which looks like an answer and is not one.

**The Overview still reads no learner or enrollment record.** Unchanged from
0.27.0 and still the reason the tiles are built from years, periods, sections,
staff and the audit log.

## Verification

Verified by server-rendering the real components against the real built
stylesheet and screenshotting at 1440px and 390px: the filled Overview, the
learner registry, the command palette, a sheet holding a form with two rejected
fields, the destructive confirmation, an unbuilt screen with folded tasks, and
the sign-in card. Two defects were found that way and fixed — a date breaking
across two lines in a narrow table, and a sheet's submit button scrolling out of
reach below the fold. `npm run check` passes.

**No signed-in browser pass has still happened**, so the data paths behind a
fetch are exactly as untested as they were. In particular the field-error
mapping is exercised only by construction: no test drives a real 422 through
`Editor`, because effects do not run in a server render.

## Next action

**Complete the first real sign-in.** 0.28.0 is deployed. **Nothing deploys on a
push** — the Vercel project is not git-connected, so `git push` runs CI and ships
nothing; `npx vercel --prod --scope joshs-projects-47d7b071` from the repository
root is the only thing that releases, and a bare `vercel deploy --prod` answers
`Not authorized`. Connecting the repository would retire the step.

What remains is the sign-in itself: open the recovery link, set a password, and
sign in at https://edunexus-balili.vercel.app. That closes the oldest open item
in the project, and it is now also the only way to see the field-error path,
the sheets and the palette against real data.

It is now blocking something concrete as well. The school's forms give thirty
real sections and eight real learning areas that carry no learner or staff
identity and need no gate opened, and they cannot be entered because there is no
manager to enter them as. Both lists are ready at the end of
[school-forms.md](school-forms.md). Enter them through the API with a reason,
never through a migration, which would bypass the version check and the change
journal that every catalog write carries.

After that, resume the frontend: **the instructional calendar screen**, then
daily attendance. Attendance cannot be recorded on a date the calendar does not
describe, so the calendar comes first. Daily attendance is the highest-frequency
screen in the system: 30 advisers, twice a day, and the one most likely to want
a sticky table header — which the current `Table` does not have, because
`.table-wrap`'s `overflow-x` makes a scroll container and a sticky `thead`
inside one has nowhere to stick. Solve that there rather than in the shared
primitive.

Then score entry → monthly consolidation → roster import and the reviewed
correction workflows. Read the design contract in
[frontend-handoff.md](frontend-handoff.md) before building one; it now carries
the sheet, confirmation, field-error, unrecorded-mark and print rules.

Backend is otherwise **fully gated**: every remaining backend increment waits on
a school decision.

### Known gap

The account service has never run. The Edge Function is written, its client is tested against a stubbed transport, and the endpoint is tested end to end against a stubbed provisioner — but no real Auth identity has been created through it, because deploying it needs the Supabase CLI and the project secrets. Treat the first real invitation as the verification step.

Frontend tests remain shallow. Every route renders once, the shell is asserted against the content policy, and the palette and unrecorded mark are covered — but effects do not run in a server render, so every data path behind a fetch is untested.

## In flight

Nothing. No half-finished work, no uncommitted changes.

## Waiting on the user

1. **Push `master`.** The deployed release was built from local source; `origin` is behind, so the live artifact cannot yet be reproduced from the repository.
2. **Deploy the account service.** `supabase functions deploy create-staff-identity --no-verify-jwt`, set `EDUNEXUS_PROVISION_SECRET` and `EDUNEXUS_INVITE_REDIRECT` as function secrets, then put the same secret and the function URL into Vercel as `PROVISION_FUNCTION_SECRET` and `PROVISION_FUNCTION_URL`. Until then the endpoint answers `IDENTITY_SERVICE_DISABLED` and the operator link-by-UUID route stays as it was — nothing breaks, the button just refuses.
3. **Complete the first real sign-in.** One screen. It closes the oldest open item in the project.
4. **Send Request 1 to the school** — the current DepEd grading enclosure plus two or three redacted ECR examples. This single gate blocks roughly ten increments: score arithmetic, transmutation, MPS, GWA, finalization, Kindergarten, promotion, SF9 and SF10. It is a request to another organisation, so the calendar cost is theirs. Wording is in [school-information-requests.md](school-information-requests.md).
5. **Configure a real SMTP provider before staff onboarding.** Supabase built-in mail sends one link a minute per address and only a few an hour for the whole project, which will not survive 33 people.

## Recent decisions worth knowing

- The workspace is drawn as a register — hairline row rules, a heavier rule under the column heads, square corners — because every DepEd form it feeds is a ruled sheet. This is the reason behind the existing corner and separation rules, not a new rule.
- A missing record is drawn with the unrecorded hatch and named. Never an em dash, never a blank cell.
- A server field rejection is shown beside its field, with a focused summary. Only an unattributed error goes to the page's status line.
- Creating a record opens a sheet; anything irreversible goes through `Confirm`, never `window.confirm`.
- The command palette searches screens only, and its footer says so on screen.
- Table columns are not sortable, and the workspace has a print stylesheet.
- The workspace is a navy rail against white surfaces with a blue accent, every corner is square, and the type is Inter with JetBrains Mono for identifiers. All four survived the 0.28.0 overhaul unchanged.
- The EDUNEXUS mark is a vector redraw in `web/components/brand.tsx`. The policy carries one `img-src 'self'`, for `/favicon.svg` alone.
- Every release is deployed to Vercel before the session ends. A push does not deploy; `npx vercel --prod --scope joshs-projects-47d7b071` does.
- No notification bell exists, and none should be added until a rule exists that can fire one.
- The Overview shows no computed grade, rate or standing, and reads no learner record.
- The manuscript requires no second authentication factor; MFA was ours, not the school's, and is removed.
- Account creation satisfies the paper's User Management requirement **without** opening the service-role gate, because the key never enters the API runtime.
- "Assessment policies are drafts only" in the original briefing **described the state at v0.15.0**; it did not forbid building approval. Adoption, binding and score entry are all in scope. Calculation is not.

All of these are in the settled-decisions table in [constraints.md](constraints.md).
