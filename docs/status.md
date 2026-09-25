# Where things stand

**Updated:** 2026-09-25 · **Version:** 0.33.0 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

**0.33.0 gave subjects and section offerings a screen** (`web/screens/Subjects.tsx`, `/subjects`), managed by managers and readable by advisers for their own sections. It also **fixed a real bug in the shared `Editor`**: it reset whatever was being typed whenever its parent re-rendered, which nearly every screen does as fetches land. `tests/web-editor.test.ts` pins the fix.

**0.32.0 gave follow-up cases a screen** and introduced DOM tests against the real API (`tests/helpers/dom.ts`, `tsconfig.web-tests.json`; see AGENTS.md).

No gate opened. No endpoint, schema, permission or academic behaviour changed.

## Single next action

**Keep building the unblocked screens**, in this order: the four learner review workflows (2B.2–2B.5), roster import (2B.1), assessment policies (4A.3–4A.5), then the aggregate learner-count endpoint for the Overview. Each gets DOM tests against the real API.

**Still waiting on the user:** the score-entry contradiction — [the frontend contract](frontend-handoff.md) says not to enable score screens while [constraints.md](constraints.md) lists score entry inside the closed grading gate although the raw-score module shipped. The Scores route stays a placeholder until that is decided.

## Verification and in flight

All 362 tests across 28 files pass, along with all three type checks and the production build.

The working tree is clean and nothing is in flight. No migration was needed, so none was written.

**The attendance screens from 0.30.0 and 0.31.0 have still never been driven by a person or by a DOM test.** `tests/web-screens.test.ts` renders them once with effects disabled; the follow-up screen is the first with its data paths tested, and the same harness should be pointed at the other four. The daily register in particular should be exercised by a real adviser against a configured calendar before anyone relies on it — and it cannot be exercised at all until the school's 2026–2027 calendar exists, because attendance cannot be recorded against an unconfigured date.

The lock-ordering concurrency finding remains open, unchanged: the fix is in, asserted against the stored function source rather than demonstrated, because PGlite serialises transactions.

## Still outstanding

- **The nine school information requests are all unsent.** [school-information-requests.md](school-information-requests.md) has them in priority order. Request 1, the grading enclosure and ECR examples, blocks about ten increments. Request 6, the privacy owner, is urgent: the supplied SF4 holds 33 real staff records in the local working area with nobody accountable for them. **The 2026–2027 school calendar is now the binding one**: three of the four attendance screens are inert without configured dates, so this is what stands between the workflow and a walkthrough.
- Score entry is still named in the closed grading gate although the raw-score module exists. Correcting its defects did not resolve that contradiction.
- **SMTP is the next onboarding blocker.** Invitations reach Supabase, but the built-in mail service is rate limited and meant for testing, so the school's own SMTP is needed before thirty-three staff are invited. A rate-limited attempt answers `IDENTITY_SERVICE_UNAVAILABLE` and leaves the invitation untouched.
- The account function's full path from the API is still unproven. It was probed directly — 401 without the secret, 400 on bad input, 405 on `GET` — but the API-to-function hop needs a signed-in manager and creates a real identity, so it was left to the first real use. A mismatched secret surfaces as `IDENTITY_SERVICE_REJECTED`, which is distinct from the disabled message.
- Three routes still render placeholders — roster import, policies, scores — and four learner review workflows have backend modules with no screen at all.
- No load test, no restore drill, no UAT or TAM evaluation. School facts — academic-year dates, address, subject interpretation — are still unentered.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`. [deployment.md](deployment.md) holds the hosted environment record and what the hosted checks do and do not establish.
