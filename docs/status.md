# Where things stand

**Updated:** 2026-09-26 · **Version:** 0.41.0 · **Last commit:** see `git log -1` · **Branch:** `master`

## Just shipped

The user asked for everything buildable without the school, and delegated the decisions ("decide for me too. im giving you full permission"). This session:

- **0.41.0 — Scores screen, migration 0024.** Raw score entry for advisers and managers: add an assessment, type a class's marks, review and record them in one batch. Nothing is totalled, averaged or converted. This settled the score-entry contradiction that had been waiting on the user since 21 September: raw entry is out of the grading gate, and the arithmetic stays in it (recorded in [constraints](constraints.md)). `0024` adds `read_assessment_components`, so an adviser can see the bound component codes and names, never the weights.
- **0.40.0 — change your own password** from the profile menu, after the current password is checked.
- **0.39.1 — advisers read their own section's calendar**, read-only.
- **0.39.0 — the privacy access log screen**, filterable by staff member or record ID, and linked from each learner's panel.
- **[Runbooks](runbooks.md)** for removing access, rollback, restore, credential rotation and a possible data exposure. None has been drilled.

Earlier: 0.38.x fixed the morning register at 27 advisers (migration 0023) and added `npm run smoke`.

## Deployed state — needs the user

**Migration 0024 is applied to the hosted database. The 0.41.0 application is not deployed**, because the deploy command was refused by the session's permission check. The live site still serves 0.38.1. That is safe, since 0024 only adds a function, but none of 0.39.0–0.41.0 is visible until someone runs:

```
npx vercel --prod --scope joshs-projects-47d7b071
npm run smoke
```

Until then `npm run smoke` reports exactly two failures, both expected: the version (0.38.1 against 0.41.0) and the new `assessment-components` route answering 404 instead of 401.

## Single next action

**Deploy 0.41.0** (above), then have a signed-in principal and one adviser walk the Scores, Privacy access log and Calendar screens on a phone and a desktop. That is also the accessibility and phone-width check nobody has done: it needs a real session, which no session of this tool has.

## Verification

All 441 tests pass across 39 files, plus all three type checks and the production build. `npm run test:race` (10 of 10) and `npm run test:load` pass on a disposable PostgreSQL with 0024 applied: 27 advisers, no refused request, each morning wave about 1.3–1.4 s. The working tree is clean.

## Still outstanding

- **Operator dashboard settings**, which cannot be set from here because `supabase config push` is forbidden: turn on **secure password change**, and configure the **school's own SMTP** before inviting 33 staff. Both are in [the runbooks](runbooks.md).
- **The nine school information requests are all unsent** — [school-information-requests.md](school-information-requests.md). Request 1 (grading enclosure) now also decides when score entry can start in practice, since assessments need an adopted policy. Request 6 (privacy owner) is urgent. The 2026–2027 calendar is what three attendance screens need.
- **Subject teachers and two-section Kinder advisers** are a school question, not a design to start.
- **Create staff accounts outside register hours** — see [the load measurement](load-measurement-2026-09-25.md).
- No drill has been run: restore, revocation, rollback, hosted load with real sign-ins. No UAT or TAM evaluation.
- The account function's full path from the API is still unproven until its first real use.

## Release procedure

Pushing does not deploy; the Vercel project is not git-connected. A release is `npm run check`, then `npm run db:migrate` when it carries a migration, then `npx vercel --prod --scope joshs-projects-47d7b071`, then `npm run smoke`. [deployment.md](deployment.md) holds the hosted environment record.
