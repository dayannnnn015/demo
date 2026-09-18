# Where things stand

Short, current, and rewritten at the end of every session. The durable records are the git history, [CHANGELOG.md](../CHANGELOG.md) and [constraints.md](constraints.md); this file only says where the last session stopped and what to pick up.

**Updated:** 2026-09-18 · **Version:** 0.25.0 · **Last commit:** `9b79d8b` · **Branch:** `master`, working tree clean

## Just shipped

Two changes, both settled by reading the manuscript itself rather than the documentation about it.

**Multi-factor authentication is gone.** The paper never mentions MFA, an authenticator, TOTP, OTP or a second factor anywhere. Its only security requirements are Data Confidentiality and role-based Access Control, which the staff roles and RLS policies already carry. Sign-in is now email and password, which also removes the enrollment step that was blocking the first real sign-in. The paper does not mention passwords either, so this was put to the user as a judgement rather than a deduction, and the reasoning is recorded in [constraints.md](constraints.md).

**A manager can create a faculty account.** That one *is* in the paper — Table 1's first functional requirement is that the Principal or Administrative Officer can manage authorized teacher accounts — and it was the only part of that requirement the system could not do. Minting an Auth identity needs a service-role key, and that key still does not go in the API runtime: it lives in an isolated Edge Function whose only reachable action is inviting one address, with no update, delete or read path over other identities.

Three **process ERDs** were then added for the paper — class preparation, attendance record, academic record — cut along the processes the manuscript names rather than along implementation domains, and each standalone. Checking them against the migrations turned up eight errors in the existing diagrams (wrong column names, wrong enum values, two columns that do not exist). All corrected, every figure regenerated, and the regeneration recipe is now written down so the drift cannot recur silently. No schema change.

| Version | What |
|---|---|
| 0.25.0 | Managers create faculty accounts; service-role key isolated in an Edge Function |
| 0.24.0 | Multi-factor authentication removed; sign-in is email and password |
| 0.23.1 | Screen render tests, corrected working contract |
| 0.23.0 | Learner registration and enrollment screens |
| 0.22.0 | Workspace design system, grouped navigation, honest placeholders |
| 0.21.0 | Workspace rebuilt on Vite + React, sessions in `sessionStorage` |
| 0.20.0 | Section 4B.1 assessment tasks and raw score entry, migration 0021 |
| 0.19.0 | Staff invitations and browser-initiated account recovery, migration 0020 |

283 tests across 22 files. **All 21 migrations are applied**; neither of these increments adds one. CI green on `master`, and https://edunexus-balili.vercel.app serves the workspace at its root.

**Vercel does not auto-deploy from GitHub.** Pushing to `master` runs CI but does not ship; deploy with `npx vercel --prod`.

## Next action

**Deploy the account service and complete the first real sign-in.** Both are operator steps and both are now short — see below. Nothing in the repository is half-finished behind them.

After that, resume the frontend: **the instructional calendar screen**, then daily attendance. Attendance cannot be recorded on a date the calendar does not describe, so the calendar comes first. Daily attendance is the highest-frequency screen in the system: 30 advisers, twice a day.

Then score entry → monthly consolidation → roster import and the reviewed correction workflows.

Backend is otherwise **fully gated**: every remaining backend increment waits on a school decision.

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
