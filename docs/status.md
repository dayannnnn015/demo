# Where things stand

**Updated:** 2026-09-21 · **Version:** 0.31.0 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

**0.31.0 gave the rest of Section 3 its screens.** Three modules that had been API-only since 0.9.0, 0.10.0 and 0.11.0 now have interfaces, and the attendance workflow is walkable end to end: configure the calendar, mark the class, consolidate the month, read the evidence.

**Daily attendance** (`web/screens/Attendance.tsx`, `/attendance`) is the highest-frequency screen in the system and the one an adviser touches twice a day. Marks are held locally and reviewed as one batch, because the API commits atomically against a single shared sheet version. A change sends **both** sessions — `pending()` builds the payload and has a test for every branch, including the one where an omitted session would silently clear a mark nobody touched. Present, absent and not-marked are three chips rather than a select, and the third is a real choice: only an explicit null clears a mark. `recording_available` is false for four distinct reasons and the screen names whichever applies, together with the screen that resolves it.

**Monthly consolidation** (`web/screens/Months.tsx`, `/months`, manager-only) offers only the transitions the current state allows and no edit form, because nothing edits a month in place. Every blocking issue is rendered as the sentence saying what to do next; a bare `MISSING_MARKS` tells a school head nothing.

**The absence monitor** (`web/screens/Monitor.tsx`, `/monitor`) reads a window of up to 31 dates, validated in the client first because the API returns one `MONITOR_RANGE` code for four different mistakes. A gap in the record is never drawn as an absence — `unconfigured` and `incomplete` carry the unrecorded mark, asserted by test.

Supporting work: `web/components/scope.tsx` holds the shared school-year and section picker all three use; `web/dates.ts` gained `shift` and `span`, both UTC-pinned like everything else in that file; the mark control has its own styles and prints as words rather than as empty radio circles.

No gate opened. No endpoint, schema, permission or academic behaviour changed, and nothing anywhere computes a total, a rate or a credit.

## Single next action

**Decide the score-entry contradiction, then build the next screen.** [The frontend contract](frontend-handoff.md) says plainly *"do not enable score screens on the current implementation"*, while [constraints.md](constraints.md) still lists score entry inside the closed grading gate although the raw-score module shipped in 0.20.0 and was corrected in 0.29.0. That is a question for the user, not a guess.

Everything else unblocked is a matter of picking one. In rough order of value: **attendance follow-up** (3B.4, the last Section 3 module without a screen, and the natural companion to the monitor), **subjects and offerings** (4A.1/4A.2), **assessment policies** (4A.3–4A.5), **roster import** (2B.1), and the four learner review workflows (2B.2–2B.5) that have no route at all. An **aggregate learner-count endpoint** is the one piece of unblocked backend work, needed before the Overview can show a roster count without burying the privacy audit.

## Verification and in flight

All 334 tests across 25 files pass, along with both type checks and the production build. `tests/web-attendance.test.ts` is new: 19 cases over the payload builder, the window validator, the month transition table, the issue vocabulary and the unrecorded mark in both new screens. It is registered in `tsconfig.web.json` and excluded from the root `tsconfig.json`, as the other web tests are.

The working tree is clean and nothing is in flight. No migration was needed, so none was written.

**The same limit as last session still applies, and now matters more.** These three screens have never been driven by a person. `tests/web-screens.test.ts` renders them once with effects disabled, so the empty and loading states are proven and every fetch, mark, review and transition is not. The daily register in particular should be exercised by a real adviser against a configured calendar before anyone relies on it — and it cannot be exercised at all until the school's 2026–2027 calendar exists, because attendance cannot be recorded against an unconfigured date.

The lock-ordering concurrency finding remains open, unchanged: the fix is in, asserted against the stored function source rather than demonstrated, because PGlite serialises transactions.

## Still outstanding

- **The nine school information requests are all unsent.** [school-information-requests.md](school-information-requests.md) has them in priority order. Request 1, the grading enclosure and ECR examples, blocks about ten increments. Request 6, the privacy owner, is urgent: the supplied SF4 holds 33 real staff records in the local working area with nobody accountable for them. **The 2026–2027 school calendar is now the binding one**: three of the four attendance screens are inert without configured dates, so this is what stands between the workflow and a walkthrough.
- Score entry is still named in the closed grading gate although the raw-score module exists. Correcting its defects did not resolve that contradiction.
- **SMTP is the next onboarding blocker.** Invitations reach Supabase, but the built-in mail service is rate limited and meant for testing, so the school's own SMTP is needed before thirty-three staff are invited. A rate-limited attempt answers `IDENTITY_SERVICE_UNAVAILABLE` and leaves the invitation untouched.
- The account function's full path from the API is still unproven. It was probed directly — 401 without the secret, 400 on bad input, 405 on `GET` — but the API-to-function hop needs a signed-in manager and creates a real identity, so it was left to the first real use. A mismatched secret surfaces as `IDENTITY_SERVICE_REJECTED`, which is distinct from the disabled message.
- Five routes still render placeholders — roster import, follow-up cases, subjects, policies, scores — and four learner review workflows have backend modules with no screen at all.
- No load test, no restore drill, no UAT or TAM evaluation. School facts — academic-year dates, address, subject interpretation — are still unentered.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`. [deployment.md](deployment.md) holds the hosted environment record and what the hosted checks do and do not establish.
