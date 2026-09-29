# Where things stand

**Updated:** 2026-09-29 · **Version:** 0.42.0 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

**29 September: figure presentation revision.** Figures 7-9 now preserve underscores in wrapped names, use a spaced two-column legend, put keys first, attach connectors to FK rows and place multiplicities beside their own entity. Compact dashed context boxes and the learner self-loop follow the user's specific requests. Schema/geometry checks enforce both multiplicities, minimum print sizes and connector/label spacing; SVG, exact-width 600-dpi PNG, PDF and ZIP regenerated. No runtime or school-policy change. `npm run check` passes (480 tests; 10 opt-in tests skipped); focused diagram checks pass. No work in flight. Pre-existing extracted ZIP files remain untracked and untouched: `output/START-HERE.txt`, `output/docs/`, `output/output/`, `output/scripts/`; they are not part of this commit.

**28 September: documentation increment.** [Capstone Figures 7-9](diagrams/paper/README.md) redrawn for portrait A4 with readable type, exact schema keys/nullability and corrected cardinalities. Includes SVG, 600-dpi PNG, captioned PDF, reproducible generators and schema metadata rebuilt from all 24 migrations (44 tables). [System/ERD review](system-and-erd-review-2026-09-28.md) records scope and remaining school gates. `npm run check` passes: 480 tests, three typechecks and build; 10 opt-in concurrency tests skipped. No runtime change, migration or redeployment; no work in flight. Manuscript unchanged. Prior deployed release follows.

**0.42.0 is a polish release**, made by walking every screen in the new `npm run demo` — the real API and workspace over synthetic records — as a principal and as an adviser, at desktop and phone width. What it fixed and added:

- **Found and fixed:** `npm run dev:web` was broken outright (the `/api` proxy also caught `web/api.ts`); the Privacy access log drew its header twice; the Enrollment screen read every learner separately, writing one access row per learner per class list, and said "LRN not issued" while still loading; the register, month and monitor listed learners in record-id order; the register's afternoon column sat off the edge of a phone; the Scores header buttons pushed the page sideways on a phone; a month that could not be submitted still offered *Submit*.
- **Added:** the access log downloads as a CSV (IDs only, formulas defused); managers see score-batch and assessment history; Enter moves down the score sheet; the register opens on the last classroom day when today has none; `/me` reports `account_service`, and Invitations stops offering an account it cannot create; the Overview and Activity log name records in plain words and say who changed them.
- **Checks:** `tests/web-a11y.test.ts` runs axe over every screen for both roles; `tests/web-screens.test.ts` fails a screen that draws its header without `ownHeader`.

Earlier this session: 0.41.0 the Scores screen and migration 0024; 0.40.0 change your own password; 0.39.1 advisers read their calendar; 0.39.0 the privacy access log; the [runbooks](runbooks.md).

## Deployed state

**0.42.0 is live** at https://edunexus-balili.vercel.app, deployed 2026-09-26 as `edunexus-mbg6mrm29-joshs-projects-47d7b071.vercel.app`; it carries no migration, and `0024` from 0.41.0 is applied. The demo page is confirmed absent from the served bundle. `npm run smoke` passes all 118 checks, and the served bundle was checked for the new screens' own strings. `master` is pushed to GitHub.

## Single next action

Have a signed-in principal and one adviser walk the Scores, Privacy access log and Calendar screens on a phone and a desktop. That is also the accessibility and phone-width check nobody has done: it needs a real session, which no session of this tool has.

## Verification

On 28 September, all 480 tests pass across 40 files, plus all three typechecks and the production build; the 10 opt-in concurrency tests skip in the ordinary suite. On 26 September, `npm run test:race` (10 of 10) and `npm run test:load` passed on a disposable PostgreSQL with 0024 applied: 27 advisers, no refused request, each morning wave about 1.3–1.4 s. Those two checks were not repeated for the documentation increment. The working tree is clean after the handoff commit.

## Still outstanding

- **Operator dashboard settings**, which cannot be set from here because `supabase config push` is forbidden: turn on **secure password change**, and configure the **school's own SMTP** before inviting 33 staff. Both are in [the runbooks](runbooks.md).
- **The nine school information requests are all unsent** — [school-information-requests.md](school-information-requests.md). Request 1 (grading enclosure) now also decides when score entry can start in practice, since assessments need an adopted policy. Request 6 (privacy owner) is urgent. The 2026–2027 calendar is what three attendance screens need.
- **Subject teachers and two-section Kinder advisers** are a school question, not a design to start.
- **Create staff accounts outside register hours** — see [the load measurement](load-measurement-2026-09-25.md).
- No drill has been run: restore, revocation, rollback, hosted load with real sign-ins. No UAT or TAM evaluation.
- The account function's full path from the API is still unproven until its first real use.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`, then `npm run smoke`. [deployment.md](deployment.md) holds the hosted environment record.
