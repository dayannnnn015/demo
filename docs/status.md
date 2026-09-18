# Where things stand

Short, current, and rewritten at the end of every session. The durable records are the git history, [CHANGELOG.md](../CHANGELOG.md) and [constraints.md](constraints.md); this file only says where the last session stopped and what to pick up.

**Updated:** 2026-09-18 · **Version:** 0.23.1 · **Last commit:** `pending` · **Branch:** `master`, pushed, working tree clean

## Just shipped

The workspace can now put data into the system: a manager registers learners, enrols them into sections and records dated movements. The assessment chain behind it is complete end to end — draft → adoption → binding → raw score entry — but has no interface yet.

| Version | What |
|---|---|
| 0.23.1 | Screen render tests, corrected working contract |
| 0.23.0 | Learner registration and enrollment screens |
| 0.22.0 | Workspace design system, grouped navigation, honest placeholders |
| 0.21.0 | Workspace rebuilt on Vite + React, sessions in `sessionStorage` |
| 0.20.0 | Section 4B.1 assessment tasks and raw score entry, migration 0021 |
| 0.19.0 | Staff invitations and browser-initiated account recovery, migration 0020 |
| 0.18.0 | Section 4A.5 offering binding, migration 0019 |
| 0.17.0 | Section 4A.4 assessment-policy adoption, migration 0018 |

276 tests across 22 files. **All 21 migrations are applied** to the development Supabase project. CI green on `master`, and https://edunexus-balili.vercel.app serves the workspace at its root.

**Vercel does not auto-deploy from GitHub.** Pushing to `master` runs CI but does not ship; deploy with `npx vercel --prod`. Connecting the Git integration in the Vercel dashboard would remove that manual step.

## Next action

**Build the instructional calendar screen**, then daily attendance. Attendance cannot be recorded on a date the calendar does not describe, so the calendar comes first. Daily attendance is the highest-frequency screen in the system: 30 advisers, twice a day.

Frontend order after that: score entry → monthly consolidation → roster import and the reviewed correction workflows.

Backend is **fully gated**: every remaining backend increment waits on a school decision. See below.

### Known gap

Frontend tests now exist but are shallow. `tests/web-screens.test.ts` renders every route once and checks the route table, which catches a crash on first render. Effects do not run in a server render, so the data paths behind a fetch are still untested, and no signed-in browser pass has happened because no human has completed a sign-in yet. The registration, enrollment and movement screens are therefore unverified against real data.

One transient test failure was observed once during this session and did not reproduce across four subsequent full runs. It is recorded here rather than treated as fixed.

## In flight

Nothing. No half-finished work, no uncommitted changes.

## Waiting on the user

1. **Complete the first real sign-in.** The Email provider is now enabled and a recovery link has been sent to the administrator address; `/auth/v1/recover` returns 200. Open the link, set a password, enroll an authenticator, then sign in at https://edunexus-balili.vercel.app. This closes the oldest open item in the project: no human has ever completed an authenticated session. Supabase built-in mail is throttled to one message per minute per address and a few per hour, so a real SMTP provider is needed before 33 staff rely on it.
2. **Send Request 1 to the school** — the current DepEd grading enclosure plus two or three redacted ECR examples. This single gate blocks roughly ten increments: score arithmetic, transmutation, MPS, GWA, finalization, Kindergarten, promotion, SF9 and SF10. It is a request to another organisation, so the calendar cost is theirs. Wording is in [school-information-requests.md](school-information-requests.md).
3. **Configure a real SMTP provider before staff onboarding.** Supabase built-in mail sends one link a minute per address and only a few an hour for the whole project, which will not survive 33 people enrolling. Until then, an operator can issue a link directly with the Auth admin API generate_link endpoint, which bypasses mail and its limits entirely.
4. **Schedule the MFA session** once the first sign-in is proven. An invited administrator identity exists but no human has completed password and authenticator enrollment. One person, once, ten minutes.
5. **The service-role-key question** (gate 10 in [constraints.md](constraints.md)) stays answered "no" until decided otherwise, which is the right default.

## Recent decisions worth knowing

- "Assessment policies are drafts only" in the original briefing **described the state at v0.15.0**; it did not forbid building approval. Adoption, binding and score entry are all in scope. Calculation is not.
- Staff invitations are tracked in EDUNEXUS, but identity creation stays with the deployment operator. The runtime holds no service-role key.
- Frontend work is no longer deferred. The API is far ahead of the interface, and the TAM evaluation measures the interface.

All of these are in the settled-decisions table in [constraints.md](constraints.md).
