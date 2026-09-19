# Where things stand

Short, current, and rewritten at the end of every session. The durable records are the git history, [CHANGELOG.md](../CHANGELOG.md) and [constraints.md](constraints.md); this file only says where the last session stopped and what to pick up.

**Updated:** 2026-09-19 · **Version:** 0.26.0 · **Last commit:** `b9bbfec` · **Branch:** `master`, working tree clean

## Just shipped

**The workspace was redesigned** against a reference the user supplied: a
professional administrative product, mostly white, organized so a screen says
what it is in one line and then gets out of the way.

The dark green rail is gone. Surfaces are white on a near-white canvas with
hairline separation, so learner records are the darkest thing on screen. Pine
green stays as the single accent. Type is Inter with JetBrains Mono for
identifiers — two variable files, 80 KB against the 135 KB of four static faces —
still self-hosted. Every route description is now one clause, and the page header
carries only the title, that clause and the DepEd form the records feed.

Two structural changes came out of it rather than out of the styling. A table row
opens into a panel spanning the full table width instead of a `<details>` inside
the last cell, which is what six-field editors actually needed. And a learner
reads as a name over its LRN in one cell, the way a class list prints.

**Two content-policy violations were found on the way.** Every screen had been
using inline `style={{ … }}` props, which `style-src 'self'` silently drops in
the deployed app while they work under the Vite dev server — they are classes
now. The redesign then nearly reintroduced the same bug with a `data:` URL
chevron on selects; there is no `img-src` at all, so selects go through a
`Select` primitive that draws an inline SVG. Both traps are now written into
[AGENTS.md](../AGENTS.md).

Three accessibility defects were corrected: two greys that failed the 4.5:1 text
minimum, and a rail whose identity block and sign-out could be scrolled out of
reach behind a seventeen-item list.

The redesign was verified by server-rendering the real components against the
real built stylesheet and screenshotting them at 1440px and 390px. **No signed-in
browser pass has still happened**, so the data paths behind a fetch are as
untested as they were.

| Version | What |
|---|---|
| 0.26.0 | Workspace redesigned: white surfaces, Inter, one line per screen |
| 0.25.1 | Dead MFA content-security directive removed from the workspace page |
| 0.25.0 | Managers create faculty accounts; service-role key isolated in an Edge Function |
| 0.24.0 | Multi-factor authentication removed; sign-in is email and password |
| 0.23.1 | Screen render tests, corrected working contract |
| 0.23.0 | Learner registration and enrollment screens |
| 0.22.0 | Workspace design system, grouped navigation, honest placeholders |
| 0.21.0 | Workspace rebuilt on Vite + React, sessions in `sessionStorage` |
| 0.20.0 | Section 4B.1 assessment tasks and raw score entry, migration 0021 |

283 tests across 22 files. **All 21 migrations are applied**; none of these increments adds one. CI green on `master`.

## Every ERD figure is portrait now

All the diagram figures were reshaped to fit a portrait page, and the constraint
behind each choice is written into [diagrams/README.md](diagrams/README.md) so it
is not rediscovered.

**The general ERD is two figures.** One figure for all twenty entities came out
2188 x 1881 — almost square — and Mermaid's ER renderer gives no way to change
that. `layoutDirection`, `nodeSpacing`, `rankSpacing` and `minEntityWidth` are
accepted by the config and then ignored, in Mermaid 11 and 12 alike; a
`direction LR` statement makes it wider; dropping the attribute blocks makes it
wider again; ELK is not wired to ER diagrams. Splitting was the only thing that
worked, so it is now records (1252 x 1349) and academics (1047 x 1943), each
standalone, together carrying all 20 entities and all 24 relationships.

**The three process views stay single figures.** Their width comes from the note
column — enum values beside an attribute, which Mermaid never wraps — not from
layout. Class preparation dropped notes only on the three entities it repeats for
context and is now 1791 x 1865. Attendance record had to drop all of them, since
its longest notes sit on its own core entities and nothing else reached portrait;
it is now 1524 x 1618, and the values it no longer prints are written out in the
prose under that figure in [erd.md](erd.md). Academic record was already portrait
at 1612 x 2029 and is untouched.

No schema change, and no other figure changed: the remaining nine were
re-rendered from their new block indices and reproduce their committed
dimensions exactly.

## The live site is current again

**https://edunexus-balili.vercel.app serves 0.26.0**, deployment `dpl_798yTJdPyphBP9nhGCNTS32gvDom`.

Verified after deploying: the live OpenAPI reports 0.26.0 across 80 paths and 109 operations and is byte-identical to `docs/openapi.json`, and the served bundle references the same `index-UCvhFvJG.js` and `index-CIrPJzaG.css` as the local build, so the redesign is what is actually running. Smoke checks pass — `/health/live` 200, `/health/ready` 200, `/api/v1/me` 401 unauthenticated, `/account/config` 200, `/app` 200.

**Deploying needs `--scope joshs-projects-47d7b071`.** A bare `vercel deploy --prod` answers `Not authorized`, because the `orgId` recorded in `.vercel/project.json` does not resolve against the logged-in account — even though `vercel whoami` succeeds and `vercel project ls` lists the project. This cost one failed attempt; the flag is now in [deployment.md](deployment.md).

It had been stuck on 0.23.0. A user hit a sign-in screen still asking for an authenticator code — a screen deleted in 0.24.0 — and the cause was not the code but the deployment: three releases were committed, pushed and CI-green while the running site stayed three behind. The live OpenAPI reported 79 operations against 80 locally, so `/api/v1/staff-invitations/{id}/identity` was absent and account creation had nothing to call.

Verified after deploying: the OpenAPI reports 0.25.1 and 80 operations, the identity endpoint is present, the served bundle hash matches the local build, all three authenticator strings are gone from it, and the `Content-Security-Policy` no longer carries `img-src data:`. Smoke checks pass — `/health/live` 200, `/health/ready` 200, `/api/v1/me` 401 unauthenticated, `/account/config` 200, `/app` 200.

**Vercel does not auto-deploy from GitHub.** Pushing to `master` runs CI but does not ship; deploy with `npx vercel --prod`. This gap went unnoticed for three releases because CI going green reads like shipping. Check the live version after any release that matters.

## Next action

**Complete the first real sign-in.** 0.26.0 is deployed and the live bundle is
confirmed to be the redesigned one, but nobody has seen it in a browser with a
session behind it, and no human has ever completed an authenticated session
against this system at all. That is the oldest open item in the project and the
largest remaining unknown. Deploying the account service is the other operator
step; both are short, and nothing in the repository is half-finished behind them.

After that, resume the frontend: **the instructional calendar screen**, then
daily attendance. Attendance cannot be recorded on a date the calendar does not
describe, so the calendar comes first. Daily attendance is the highest-frequency
screen in the system: 30 advisers, twice a day.

Then score entry → monthly consolidation → roster import and the reviewed
correction workflows. Read the design contract in
[frontend-handoff.md](frontend-handoff.md) before building one — the two
content-policy traps above are both easy to walk back into.

Backend is otherwise **fully gated**: every remaining backend increment waits on
a school decision.

### Known gap

The account service has never run. The Edge Function is written, its client is tested against a stubbed transport, and the endpoint is tested end to end against a stubbed provisioner — but no real Auth identity has been created through it, because deploying it needs the Supabase CLI and the project secrets. Treat the first real invitation as the verification step.

Frontend tests remain shallow: `tests/web-screens.test.ts` renders every route once, which catches a crash on first render, but effects do not run in a server render, so the data paths behind a fetch are untested. No signed-in browser pass has happened yet.

## In flight

Nothing. No half-finished work, no uncommitted changes.

## Waiting on the user

1. **Deploy the account service.** `supabase functions deploy create-staff-identity --no-verify-jwt`, set `EDUNEXUS_PROVISION_SECRET` and `EDUNEXUS_INVITE_REDIRECT` as function secrets, then put the same secret and the function URL into Vercel as `PROVISION_FUNCTION_SECRET` and `PROVISION_FUNCTION_URL`. Steps are in [deployment.md](deployment.md). Until then the endpoint answers `IDENTITY_SERVICE_DISABLED` and the operator link-by-UUID route stays as it was — nothing breaks, the button just refuses.
2. **Complete the first real sign-in.** Open the recovery link, set a password, sign in at https://edunexus-balili.vercel.app. There is no authenticator step any more, so this is now one screen. It closes the oldest open item in the project: no human has ever completed an authenticated session.
3. **Send Request 1 to the school** — the current DepEd grading enclosure plus two or three redacted ECR examples. This single gate blocks roughly ten increments: score arithmetic, transmutation, MPS, GWA, finalization, Kindergarten, promotion, SF9 and SF10. It is a request to another organisation, so the calendar cost is theirs. Wording is in [school-information-requests.md](school-information-requests.md).
4. **Configure a real SMTP provider before staff onboarding.** Supabase built-in mail sends one link a minute per address and only a few an hour for the whole project, which will not survive 33 people. This now matters more, because account creation sends an invitation email per member of staff.
5. **The service-role gate is narrower than it was.** It no longer blocks account creation, which is what it was written for. It now only covers putting the key in the API runtime itself, which nothing needs. Deleting or altering an existing identity is still an operator action in Supabase.

## Recent decisions worth knowing

- The manuscript requires no second authentication factor; MFA was ours, not the school's, and is removed.
- Account creation satisfies the paper's User Management requirement **without** opening the service-role gate, because the key never enters the API runtime.
- "Assessment policies are drafts only" in the original briefing **described the state at v0.15.0**; it did not forbid building approval. Adoption, binding and score entry are all in scope. Calculation is not.
- Frontend work is no longer deferred. The API is far ahead of the interface, and the TAM evaluation measures the interface.

All of these are in the settled-decisions table in [constraints.md](constraints.md).
