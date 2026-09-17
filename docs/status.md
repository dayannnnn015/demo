# Where things stand

Short, current, and rewritten at the end of every session. The durable records are the git history, [CHANGELOG.md](../CHANGELOG.md) and [constraints.md](constraints.md); this file only says where the last session stopped and what to pick up.

**Updated:** 2026-09-18 · **Version:** 0.21.0 · **Last commit:** `0c6bbe3` · **Branch:** `master`, pushed, working tree clean

## Just shipped

The assessment chain is complete end to end — draft → adoption → binding → raw score entry — and the workspace was rebuilt on Vite + React.

| Version | What |
|---|---|
| 0.21.0 | Workspace rebuilt on Vite + React, sessions in `sessionStorage` |
| 0.20.0 | Section 4B.1 assessment tasks and raw score entry, migration 0021 |
| 0.19.0 | Staff invitations and browser-initiated account recovery, migration 0020 |
| 0.18.0 | Section 4A.5 offering binding, migration 0019 |
| 0.17.0 | Section 4A.4 assessment-policy adoption, migration 0018 |

272 tests across 21 files. **All 21 migrations are applied** to the development Supabase project. CI green on `master`, and https://edunexus-balili.vercel.app serves the workspace at its root.

**Vercel does not auto-deploy from GitHub.** Pushing to `master` runs CI but does not ship; deploy with `npx vercel --prod`. Connecting the Git integration in the Vercel dashboard would remove that manual step.

## Next action

**Build the learner registration and enrollment screens** (Section 2A mutations, manager-only, version-checked). The registry is empty, and nothing downstream is usable without learners.

Agreed frontend order after that: calendar setup → daily attendance → score entry → monthly workflows → imports and correction reviews. Daily attendance is the highest-frequency screen in the system: 30 teachers, twice a day.

Backend is **fully gated**: every remaining backend increment waits on a school decision. See below.

## In flight

Nothing. No half-finished work, no uncommitted changes.

## Waiting on the user

1. **Send Request 1 to the school** — the current DepEd grading enclosure plus two or three redacted ECR examples. This single gate blocks roughly ten increments: score arithmetic, transmutation, MPS, GWA, finalization, Kindergarten, promotion, SF9 and SF10. It is a request to another organisation, so the calendar cost is theirs. Wording is in [school-information-requests.md](school-information-requests.md).
2. **Schedule the MFA session.** An invited administrator identity exists but no human has completed password and authenticator enrollment, so an end-to-end authenticated login has never been proven. One person, once, ten minutes.
3. **The service-role-key question** (gate 10 in [constraints.md](constraints.md)) stays answered "no" until decided otherwise, which is the right default.

## Recent decisions worth knowing

- "Assessment policies are drafts only" in the original briefing **described the state at v0.15.0**; it did not forbid building approval. Adoption, binding and score entry are all in scope. Calculation is not.
- Staff invitations are tracked in EDUNEXUS, but identity creation stays with the deployment operator. The runtime holds no service-role key.
- Frontend work is no longer deferred. The API is far ahead of the interface, and the TAM evaluation measures the interface.

All of these are in the settled-decisions table in [constraints.md](constraints.md).
