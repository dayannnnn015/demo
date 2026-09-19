# Where things stand

Short, current, and rewritten at the end of every session. The durable records are the git history, [CHANGELOG.md](../CHANGELOG.md) and [constraints.md](constraints.md); this file only says where the last session stopped and what to pick up.

**Updated:** 2026-09-19 · **Version:** 0.27.2 · **Last commit:** see `git log -1` · **Branch:** `master`, working tree clean

## Just shipped

**The workspace has a favicon, and it is the school's mark.** 0.27.1 recorded
that it could not have one and left the user a question: does the exact logo
matter more than an unbroken `default-src 'none'`? The user asked for the
favicon, so the policy now carries one extra directive, `img-src 'self'`, and
nothing else changed about it.

That directive admits same-origin image files only — no `data:`, no remote host
— and this origin serves only the built bundle, so nothing user-supplied can
arrive through it. **No screen loads an image.** The rail mark, the icon set and
every chart are still inline SVG, and the two CSP traps in
`tests/web-shell.test.ts` still fail on an `<img>` or a `data:` URL anywhere in
the rendered app.

The icon is `web/public/favicon.svg`, copied verbatim into `public/` by Vite and
served at `/favicon.svg` by both Express and the Vercel CDN. It is a third cut of
the same geometry as `web/components/brand.tsx` and `docs/brand/edunexus-mark.svg`
— with a white ground, because the navy mountain and the white pages both vanish
against a dark browser theme, and without the sub-pixel notches inside the peaks,
which only turn to mud at 16px. Re-cut all three together.

`tests/foundation.test.ts` now serves the shell and pins the policy: it still
starts at `default-src 'none'`, its `img-src` is `'self'` with no `data:` and no
remote origin, and the page links the icon. Widening that directive quietly now
fails a test.

**Deploying is part of finishing a change from now on.** The user asked that
every change be synced to Vercel. The project is not git-connected, so a push
ships nothing — `npx vercel --prod --scope joshs-projects-47d7b071` is the
deploy, and it belongs at the end of every release rather than in the waiting-on
list. Recorded in the settled-decisions table.

## Before that

**The workspace was overhauled a second time**, against a second reference: the
user's own earlier prototype. The instruction was to take its colour and its
shell — the dark sidebar, the profile in the top right — and explicitly *not* its
contents.

The rail is now deep navy and is the only dark region on screen; everything
holding a record stays white. The accent moved from pine green to blue, which is
the rail's own hue at a lighter depth, so the current navigation item, the
primary button and the chart ramp are one colour at four strengths. Rail text has
its own tokens checked against the rail — `--ink-500` on navy is unreadable.

**The sidebar collapses two ways**, which is what the user asked for. Each group
heading folds its items away, and the rail itself collapses to a 76px icon strip.
Collapsing the group holding the current page is allowed; a dot on the heading
says where you are. Both preferences sit in `sessionStorage` beside the session,
so a shared staffroom machine does not keep one person's layout for the next.

**The identity block moved into a top-bar profile menu**, which also closes the
accessibility defect 0.26.0 patched by hand: sign-out can no longer be scrolled
out of reach behind a seventeen-item list, because it is no longer in the list.

**There is no notification bell.** The prototype has one; the absence-alert gate
blocks any messaging on attendance, so nothing may raise an alert and a badge
would imitate a signal that does not exist.

**A new Overview screen** is the landing page — greeting, four counted tiles, the
school year drawn with its reporting periods and today marked, sections by grade
as a ring, the section-and-adviser list, and the latest recorded changes.

| Version | What |
|---|---|
| 0.27.2 | The mark as the browser tab icon; `img-src 'self'` for that one file |
| 0.27.1 | Square corners, a wider brighter rail, the EDUNEXUS mark as inline SVG |
| 0.27.0 | Navy rail, collapsible navigation, top-bar profile, Overview screen |
| 0.26.0 | Workspace redesigned: white surfaces, Inter, one line per screen |
| 0.25.1 | Dead MFA content-security directive removed from the workspace page |
| 0.25.0 | Managers create faculty accounts; service-role key isolated in an Edge Function |
| 0.24.0 | Multi-factor authentication removed; sign-in is email and password |
| 0.23.1 | Screen render tests, corrected working contract |
| 0.23.0 | Learner registration and enrollment screens |

292 tests across 23 files. **All 21 migrations are applied**; this increment adds none.

## Two things about the Overview worth not undoing

**It reproduces none of the prototype's headline numbers.** That reference led
with a general average of 88.4, an academic-standing ring and a 97.6% attendance
rate. Grade arithmetic sits behind the grading-enclosure gate and attendance
rates behind the mark-meanings gate, so none of them may exist here. The screen
keeps the layout, fills it with facts the system is allowed to state, and ends
with a callout saying plainly that no average, rate, standing or ranking exists
anywhere — so the absence reads as a decision, not an oversight. The user was
shown the conflict and chose this over both showing the numbers and showing
locked placeholder tiles.

**It reads no learner or enrollment record at all.** Every list under
`/learners` and `/enrollments` writes a `record_access_events` row naming the
exact records returned. Counting 897 enrolments on each dashboard load would
write nine such rows per visit, each carrying a hundred learner IDs, and bury the
privacy audit under its own noise. The tiles are built from years, periods,
sections, staff and the audit log instead. A future tile needing a learner count
needs an aggregate endpoint that returns a number without naming records.

## Charts had to be hand-drawn, and both CSP traps are now tested

Under `default-src 'none'` a charting library that rasterises to a canvas or
injects a background image has nothing to draw into, and one that sizes a bar
with `style={{ width }}` is dropped silently. SVG geometry attributes are not
inline styles, so `web/components/figures.tsx` expresses every data-dependent
dimension as one of those.

`tests/web-shell.test.ts` now renders the shell and every route and fails on any
inline `style` attribute, any `data:` URL and any `<img>`. Both of those shipped
once before and neither was visible under `npm run dev:web`, which is exactly the
class of bug a rendered-markup assertion catches and a typecheck cannot.

A new web test must be listed in `tsconfig.web.json` **and** excluded from the
root `tsconfig.json`, or the server typecheck fails on it with TS2835. That cost
one failed `npm run check` this session.

## Verification

Verified by server-rendering the real components against the real built
stylesheet and screenshotting at 1440px and 390px: the full rail, the collapsed
icon rail, the mobile off-canvas drawer, the open profile menu and the sign-in
card. The 0.27.1 pass re-rendered the rail and the sign-in card against the
rebuilt stylesheet, and compared the redrawn mark against the supplied PNG at
each iteration. `npm run check` passes.

**No signed-in browser pass has still happened**, so the data paths behind a
fetch are exactly as untested as they were.

## Next action

**Complete the first real sign-in.** 0.27.2 is deployed. **Nothing deploys on a
push** — the Vercel project is not git-connected, so `git push` runs CI and ships
nothing; `npx vercel --prod --scope joshs-projects-47d7b071` from the repository
root is the only thing that releases, and a bare `vercel deploy --prod` answers
`Not authorized`. Since 0.27.2 that command is part of finishing a release, not
an optional follow-up. Connecting the repository would retire the step.

What remains is the sign-in itself: open the recovery link, set a password, and
sign in at https://edunexus-balili.vercel.app.

That closes the oldest open item in the project: no human has ever completed an
authenticated session against this system, and the Overview is the first screen
that would prove the data paths work.

After that, resume the frontend: **the instructional calendar screen**, then
daily attendance. Attendance cannot be recorded on a date the calendar does not
describe, so the calendar comes first. Daily attendance is the highest-frequency
screen in the system: 30 advisers, twice a day.

Then score entry → monthly consolidation → roster import and the reviewed
correction workflows. Read the design contract in
[frontend-handoff.md](frontend-handoff.md) before building one.

Backend is otherwise **fully gated**: every remaining backend increment waits on
a school decision.

### Known gap

The account service has never run. The Edge Function is written, its client is tested against a stubbed transport, and the endpoint is tested end to end against a stubbed provisioner — but no real Auth identity has been created through it, because deploying it needs the Supabase CLI and the project secrets. Treat the first real invitation as the verification step.

Frontend tests remain shallow. Every route renders once and the shell is asserted against the content policy, but effects do not run in a server render, so the data paths behind a fetch are untested.

## In flight

Nothing. No half-finished work, no uncommitted changes.

## Waiting on the user

1. **Push `master`.** The deployed release was built from local source; `origin` is behind, so the live artifact cannot yet be reproduced from the repository.
2. **Deploy the account service.** `supabase functions deploy create-staff-identity --no-verify-jwt`, set `EDUNEXUS_PROVISION_SECRET` and `EDUNEXUS_INVITE_REDIRECT` as function secrets, then put the same secret and the function URL into Vercel as `PROVISION_FUNCTION_SECRET` and `PROVISION_FUNCTION_URL`. Until then the endpoint answers `IDENTITY_SERVICE_DISABLED` and the operator link-by-UUID route stays as it was — nothing breaks, the button just refuses.
3. **Complete the first real sign-in.** One screen, now that there is no authenticator step. It closes the oldest open item in the project.
4. **Send Request 1 to the school** — the current DepEd grading enclosure plus two or three redacted ECR examples. This single gate blocks roughly ten increments: score arithmetic, transmutation, MPS, GWA, finalization, Kindergarten, promotion, SF9 and SF10. It is a request to another organisation, so the calendar cost is theirs. Wording is in [school-information-requests.md](school-information-requests.md).
5. **Configure a real SMTP provider before staff onboarding.** Supabase built-in mail sends one link a minute per address and only a few an hour for the whole project, which will not survive 33 people.

## Recent decisions worth knowing

- The workspace is a navy rail against white surfaces with a blue accent. This supersedes the pine-green decision of 2026-09-18 for colour only; the typography and hairline-separation rules still stand. Since 0.27.1 the rail is wider, its blue is saturated, and its text is white.
- Every corner in the system is square, and the radius tokens are the only place that changes.
- The EDUNEXUS mark is a vector redraw in `web/components/brand.tsx`, because no screen loads an image file. The artwork lives in `docs/brand/`, never in `public/`. Since 0.27.2 the policy carries one `img-src 'self'`, for `/favicon.svg` alone, on the user's instruction.
- Every release is deployed to Vercel before the session ends. A push does not deploy; `npx vercel --prod --scope joshs-projects-47d7b071` does.
- No notification bell exists, and none should be added until a rule exists that can fire one.
- The Overview shows no computed grade, rate or standing, and reads no learner record.
- The manuscript requires no second authentication factor; MFA was ours, not the school's, and is removed.
- Account creation satisfies the paper's User Management requirement **without** opening the service-role gate, because the key never enters the API runtime.
- "Assessment policies are drafts only" in the original briefing **described the state at v0.15.0**; it did not forbid building approval. Adoption, binding and score entry are all in scope. Calculation is not.

All of these are in the settled-decisions table in [constraints.md](constraints.md).
