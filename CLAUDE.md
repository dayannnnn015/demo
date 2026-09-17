# Working in this repository

EDUNEXUS is a learner attendance and academic records system for Balili Elementary School, La Trinidad, Benguet. It will hold real records for roughly 897 learners and 33 staff. Correctness and privacy are the point of the project, not a nice-to-have.

This file is the working contract for whoever picks the project up. It was written during the handover from the agent that started the project, so nothing below assumes you were present for earlier sessions.

## Read these first, in this order

1. **[docs/constraints.md](docs/constraints.md)** — standing rules, blocking gates, settled decisions. Where any other document disagrees with it, this one wins and the other is wrong.
2. **[docs/roadmap.md](docs/roadmap.md)** — sections, what is implemented, and which gate each next step waits on.
3. **[docs/architecture.md](docs/architecture.md)** — identity, the database boundary, concurrency and audit.
4. **[CHANGELOG.md](CHANGELOG.md)** — every release mapped to its section and migration.
5. **[docs/school-information-requests.md](docs/school-information-requests.md)** — what the school still has to supply, and why work is blocked without it.

`docs/manuscript-analysis.md` explains where the requirements came from and which of them turned out to be contradictory. The manuscript itself is **not** in this repository and must never be committed.

## Rules that do not bend

- **Never modify an applied migration.** They are checksummed and the runner refuses a changed file. To alter a deployed function, `create or replace` it in a **new** migration. Migrations `0018`, `0019` and `0021` each do this; follow that pattern.
- **Never invent DepEd policy.** No grading weights, transmutation table, rounding rule, passing mark or numeric Kindergarten grading. If a rule is not in `docs/constraints.md` as settled, it is not ours to choose. A wrong rule here silently corrupts real report cards.
- **Never weaken a backend control to make a frontend workflow easier.** The API is the authority; the UI is a convenience over it.
- **Never commit or print credentials** from `.env` or `.local/`. Scratch scripts that need them run from `.local/` and are deleted afterwards.
- **Synthetic data only** in tests, and roll back anything written to a hosted database.
- **Managers change learner records; teachers read only their currently assigned learners.** This was an explicit decision where the manuscript contradicted itself.
- **Absence of a record is not evidence.** An unmarked attendance session and an unrecorded score are `null`, never zero and never "present". Several modules exist specifically to preserve this.

## The increment pattern

Work lands as one reviewable increment per commit. Every module in `src/modules/` follows the same shape, and a new one should too.

1. **Check the gate.** If the work sits behind a closed gate in `docs/constraints.md`, stop and say which one. Do not approximate a missing school decision with a default.
2. **Migration** in `database/migrations/NNNN_name.sql`: tables, partial unique indexes, RLS policies, `grant select` only to `edunexus_app`, `version_record` and `audit_record` triggers, then `security definer` writer functions that are revoked from `public` and granted narrowly.
3. **Module** in `src/modules/<name>/` with `contracts.ts` (Zod schemas, operation list, response schemas) and `service.ts` (thin; the database function does the validating).
4. **Wire it**: `src/operations.ts`, the dispatch line and readiness check in `src/http-app.ts`, the response map and tag in `src/openapi.ts`, and any new error codes in `src/core/errors.ts`.
5. **Tests** in `tests/<name>.test.ts` — about ten focused cases, covering the happy path, every refusal, manager/teacher isolation in both HTTP and SQL, version conflicts, and a journal-failure rollback.
6. **Docs**: a section file in `docs/`, plus updates to `README.md`, `docs/roadmap.md`, `docs/architecture.md`, `docs/frontend-handoff.md` and `CHANGELOG.md`.
7. **Version** bump in `package.json`, `package-lock.json` and the `version` and `description` in `src/openapi.ts`, then `npm run api:export`.
8. **`npm run check`** must pass, then commit.

### Database conventions

- Writers acquire `pg_advisory_xact_lock(82412001)`, the shared academic-setup lock, then `select ... for share` on the school year row when year status matters.
- Every mutation takes the caller's last-read `version` and raises `P0003` on a mismatch. Never silently overwrite.
- Every mutation writes an immutable journal row in the same transaction, with before/after snapshots, actor, reason and request ID. If the journal cannot be written, the whole change rolls back — there is a test for this in every module.
- A reason is 10–500 single-line characters. Reuse `subjectReason` from `src/modules/subjects/contracts.ts`.
- Security-definer functions bypass RLS, so any row policy they need must be re-checked inside the function. `edunexus.assert_may_grant_role` exists because of exactly this.
- Do not shadow a column name with a PL/pgSQL variable. A local named `value` inside `for ... in select value from jsonb_array_elements(...)` is ambiguous and fails at runtime, not at creation.

### Error code ranges

`P0002` not found and `P0003` version conflict are shared. Module ranges: `P01xx` timeline, `P02xx` identity, `P03xx` enrollment records, `P04xx` placement, `P05xx` calendar, `P06xx` attendance, `P07xx` months, `P08xx` monitor, `P09xx` follow-ups, `P10xx` subjects, `P11xx` offerings, `P12xx` policy drafts, `P13xx` adoptions, `P14xx` bindings, `P15xx` invitations, `P16xx` assessment tasks and scores. **Next free range: `P17xx`.**

### Style

Module and migration code is deliberately dense — multiple statements per line, minimal whitespace. Match the surrounding file rather than reformatting it. Comments are rare and explain *why*, not what.

## Commands

```powershell
rtk proxy npm.cmd run check        # typecheck, 272 tests, build. Must pass before commit.
rtk proxy npm.cmd run api:export   # regenerate docs/openapi.json after a contract change
rtk proxy npm.cmd run db:migrate   # apply pending migrations (needs the operator credential)
rtk proxy npm.cmd run dev          # local API on http://127.0.0.1:3001
```

Tests use PGlite and need no Docker or cloud credentials. The full suite takes about 90 seconds; run it in the background rather than blocking on it.

## Current state

Sections 1 through 4B.1 are implemented: staff and school setup, the learner registry with reviewed imports and every correction workflow, instructional calendars, daily and monthly attendance with absence monitoring and follow-up, the subject catalog and section offerings, and the assessment-policy chain of draft → adoption → binding → raw score entry.

The frontend is deliberately far behind: `/app` covers Section 1 plus a read-only learner registry. Everything else is API-only. See `docs/frontend-handoff.md`, which describes each unbuilt screen and the rules it must respect.

**Nothing computes a grade.** Scores are recorded; no total, average, percentage, MPS, GWA or transmutation exists anywhere, because the school has not yet supplied the rules. This is the single largest blocked area and it is blocked deliberately.

## When instructions conflict

Ask. The constraints file exists because a briefing once described the state of the system in words that read like a prohibition, and the difference decided whether a whole module should be built. If a request and `docs/constraints.md` disagree, raise it in a sentence and wait — a wrong guess is expensive in a system that will hold real learner records.
