# Where things stand

**Updated:** 2026-09-21 · **Version:** 0.30.0 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

Three releases in one session.

**0.28.1 was committed at last.** It had been deployed on 20 September and never committed: this file claimed a clean tree while twenty files sat modified and the review report was untracked, so the live deployment had no commit behind it.

**0.29.0 and migration `0022`** corrected the four score defects the [20 September review](backend-review-2026-09-20.md) reproduced, on the user's authorization. A former adviser loses a departed learner's marks in SQL as well as over HTTP; an omitted `raw_score` key no longer clears a recorded mark; score sheet, entry and history reads write `record_access_events` rows; both score columns widened to `numeric(7,2)`. Both writers now lock before the reads they version-check.

**0.30.0 gave the instructional calendar a screen**, which is where frontend work resumed. A month at a time, because the SF2 is a month; an unconfigured date drawn with the unrecorded mark rather than left blank; set and clear through the API's own preview-and-confirm, with the hash discarded on any refusal; conflicts explained in words with the affected sections named; and the all-scope change history behind its `before_version` cursor. `web/dates.ts` now holds plain-calendar-date arithmetic that never touches local time.

No gate opened in any of the three.

**The account service was then configured**, after a signed-in principal met `IDENTITY_SERVICE_DISABLED` trying to create a staff account. That refusal was correct — no provisioning function existed — so `create-staff-identity` was deployed to Supabase with its own secret and invite redirect, the runtime was given the matching pair, and the API was redeployed. No code changed. The service-role key is still only inside that function.

## Single next action

**Build the daily attendance screen.** [Section 3B.1](daily-attendance.md) is the highest-frequency screen in the system — thirty advisers, twice a day — and it is now unblocked, because the calendar it depends on can finally be configured. [The frontend contract](frontend-handoff.md) has the rules it must respect; the calendar screen is the closest working example of the same preview-and-confirm shape.

## Verification and in flight

All 315 tests across 24 files, server and web type checks and the production build pass. Migration `0022` is applied to the hosted database and was verified there from catalog metadata. The working tree is clean and nothing is in flight.

A real staff sign-in has now happened: the user reported being signed in as the school principal, and the refusal they met is one only an authenticated manager can reach. That is the first evidence the whole authenticated path works in a browser.

Two limits worth carrying forward. The **lock-ordering concurrency finding is still open**: the fix is in, but the ordering is asserted against the stored function source rather than demonstrated, because PGlite serializes transactions and cannot show the race. And **almost no screen's data path has been exercised deliberately** — the web tests render every route but effects do not run, so every fetch, save and review is unproven except where the principal's own use has happened to touch it. The calendar screen in particular has never been driven by anyone.

## Still outstanding

- **The nine school information requests are all unsent.** [school-information-requests.md](school-information-requests.md) has them in priority order. Request 1, the grading enclosure and ECR examples, blocks about ten increments. Request 6, the privacy owner, is urgent: the supplied SF4 holds 33 real staff records in the local working area with nobody accountable for them. The 2026–2027 school calendar is now the other pressing one — the screen exists and there are no approved dates to put in it.
- Score entry is still named in the closed grading gate although the raw-score module exists. Correcting its defects did not resolve that contradiction.
- **SMTP is the next onboarding blocker.** Invitations now reach Supabase, but the built-in mail service is rate limited and meant for testing, so the school's own SMTP is needed before thirty-three staff are invited. A rate-limited attempt answers `IDENTITY_SERVICE_UNAVAILABLE` and leaves the invitation untouched.
- The account function's full path from the API is still unproven. It was probed directly — 401 without the secret, 400 on bad input, 405 on `GET` — but the API-to-function hop needs a signed-in manager and creates a real identity, so it was left to the first real use. A mismatched secret surfaces as `IDENTITY_SERVICE_REJECTED`, which is distinct from the disabled message.
- Seven routes still render placeholders — roster import, daily attendance, monthly consolidation, follow-up cases, subjects, policies, scores — and five review workflows have backend modules with no screen at all.
- No load test, no restore drill, no UAT or TAM evaluation. School facts — academic-year dates, address, subject interpretation — are still unentered.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`. [deployment.md](deployment.md) holds the hosted environment record and what the hosted checks do and do not establish.
