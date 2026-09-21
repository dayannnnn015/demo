# Where things stand

**Updated:** 2026-09-21 · **Version:** 0.29.0 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

Two commits. The first is **0.28.1, which had been deployed on 20 September and never committed** — `status.md` claimed a clean tree while twenty files sat modified and the review report was untracked, so the live deployment had no commit behind it. Nothing in that work changed; it is now recorded.

The second is **0.29.0 and migration `0022`**, the corrective migration the user authorized on 21 September for the four score defects the [20 September review](backend-review-2026-09-20.md) reproduced. A former adviser loses a departed learner's marks in SQL as well as over HTTP; an omitted `raw_score` key no longer clears a recorded mark; score sheet, entry and history reads write `record_access_events` rows naming exactly what they disclosed; and both score columns widened to `numeric(7,2)` so the documented maximum of 10000 fits. Both writers now take the shared academic lock before the reads they version-check.

No gate opened. No endpoint, error code or arithmetic was added, and `P17xx` is still the next free range.

## Single next action

**Write the multi-connection concurrency regression for the score writers.** It is the last open finding in the review and the one thing `0022` could not close: the lock-before-read ordering is asserted against the stored function source, not demonstrated under concurrency, because PGlite serializes transactions. It needs a real PostgreSQL with two connections — a local server, a container, or a rolled-back fixture on the development Supabase project.

## Verification and in flight

All 308 tests across 23 files, server and web type checks and the production build pass. Each of the four correction tests was additionally run against a database built without `0022` and fails there, so they are regressions rather than restatements of current behavior. The working tree is clean and nothing is in flight.

## Still outstanding

- **The nine school information requests are all unsent.** [school-information-requests.md](school-information-requests.md) has them in priority order. Request 1, the grading enclosure and ECR examples, alone blocks about ten increments and is the critical path. Request 6, the privacy owner, is urgent for a different reason: the supplied SF4 holds 33 real staff records in the local working area with nobody named as accountable for them.
- Score entry is still named in the closed grading gate although the raw-score module exists. Correcting its defects did not resolve that contradiction and was not allowed to.
- First real manager password setup and sign-in remain unverified. The account Edge Function is neither deployed nor configured, and SMTP is not set up.
- The frontend is still 0.28.0's workspace, paused at the user's request. Eight routes render placeholders and five review workflows have backend modules with no screen at all; [frontend-handoff.md](frontend-handoff.md) lists them and the rules each must respect.
- No load test, no restore drill, no UAT or TAM evaluation. School facts — academic-year dates, address, subject interpretation — are still unentered.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`. [deployment.md](deployment.md) holds the hosted environment record and what the hosted checks do and do not establish.
