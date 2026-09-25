# Where things stand

**Updated:** 2026-09-25 · **Version:** 0.37.4 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

**0.37.4 found that the morning register fails at the school's own load**: with 27 advisers at once, over half are refused before seeing their register, because every attendance read takes the exclusive academic lock ([the measurement](load-measurement-2026-09-25.md)). **0.37.3 closed the review's lock-ordering finding** with a real two-connection PostgreSQL test (`npm run test:race`, opt-in, needs Docker). **0.37.2** made two contracts plain text again (literal control bytes had made git treat them as binary). **0.37.1 drove the four attendance screens end to end in tests** — calendar, register, months, monitor — and found no defect. **0.37.0 added `GET /enrollment-counts`** — learner counts by grade and status that name nobody and write no access row — and the Overview now shows *Learners enrolled* and *Learners by grade* from it.

Earlier this session: **0.36.0** assessment policies, **0.35.0** roster import, **0.34.0** the reviewed corrections, **0.33.0** subjects and offerings plus a fix to the shared `Editor` losing input, **0.32.0** follow-up cases and DOM tests against the real API (`tests/helpers/dom.ts`, `tsconfig.web-tests.json`; see AGENTS.md). Every route except Scores is now a real screen.

No gate opened. No migration, permission or academic behaviour changed.

## Single next action

**Get the user's decision on migration 0023**, which would make attendance reads take the academic lock in shared mode and writers take it exclusively first. It is the fix for the load finding above and changes the database's locking protocol, so it is not written until the user authorizes it. If authorized: write it with `create or replace`, prove it with `npm run test:load` (no refusals at 27 advisers) and a reader/writer case in `tests/concurrency.pg.test.ts`, then apply it to the hosted database with `npm run db:migrate`.

**Also waiting on the user:** the score-entry contradiction — [the frontend contract](frontend-handoff.md) says not to enable score screens while [constraints.md](constraints.md) lists score entry inside the closed grading gate although the raw-score module shipped. The Scores route stays a placeholder until that is decided.

Everything else unblocked is done. What remains is the school's information requests and the operator's hosted drills (restore, revocation, rollback, a hosted load run).

## Verification and in flight

All 407 tests across 35 files pass (plus the 4 opt-in race tests, which skip without Docker), along with all three type checks and the production build.

The working tree is clean and nothing is in flight. No migration was needed, so none was written.

**Every built screen now has its data paths tested against the real API** — the attendance four since 0.37.1 (`tests/web-attendance-flow.test.ts`). None has yet been driven by a real adviser against the school's own calendar, which does not exist yet. The daily register in particular should be exercised by a real adviser against a configured calendar before anyone relies on it — and it cannot be exercised at all until the school's 2026–2027 calendar exists, because attendance cannot be recorded against an unconfigured date.

The lock-ordering concurrency finding is closed: `npm run test:race` shows both races under the 0021 definitions and 0022 refusing them, on a real PostgreSQL server.

## Still outstanding

- **The nine school information requests are all unsent.** [school-information-requests.md](school-information-requests.md) has them in priority order. Request 1, the grading enclosure and ECR examples, blocks about ten increments. Request 6, the privacy owner, is urgent: the supplied SF4 holds 33 real staff records in the local working area with nobody accountable for them. **The 2026–2027 school calendar is now the binding one**: three of the four attendance screens are inert without configured dates, so this is what stands between the workflow and a walkthrough.
- Score entry is still named in the closed grading gate although the raw-score module exists. Correcting its defects did not resolve that contradiction.
- **SMTP is the next onboarding blocker.** Invitations reach Supabase, but the built-in mail service is rate limited and meant for testing, so the school's own SMTP is needed before thirty-three staff are invited. A rate-limited attempt answers `IDENTITY_SERVICE_UNAVAILABLE` and leaves the invitation untouched.
- The account function's full path from the API is still unproven. It was probed directly — 401 without the secret, 400 on bad input, 405 on `GET` — but the API-to-function hop needs a signed-in manager and creates a real identity, so it was left to the first real use. A mismatched secret surfaces as `IDENTITY_SERVICE_REJECTED`, which is distinct from the disabled message.
- One route still renders a placeholder: Scores, pending the decision above.
- No load test, no restore drill, no UAT or TAM evaluation. School facts — academic-year dates, address, subject interpretation — are still unentered.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`. [deployment.md](deployment.md) holds the hosted environment record and what the hosted checks do and do not establish.
