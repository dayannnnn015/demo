# Working in this repository

EDUNEXUS is a learner attendance and academic records system for Balili Elementary School, La Trinidad, Benguet. It will hold real records for roughly 897 learners and 33 staff. Correctness and privacy are the point of the project, not a nice-to-have.

This file is the working contract for any agent or person picking the project up. It is deliberately tool-neutral: Codex reads `AGENTS.md` directly, and `CLAUDE.md` is a one-line pointer to this file, so there is one source of truth rather than two that drift.

## Start of session

1. Read **[docs/status.md](docs/status.md)** — where the last session stopped, what is in flight, and the single next action.
2. Read **[docs/constraints.md](docs/constraints.md)** — standing rules, blocking gates, settled decisions. Where any other document disagrees with it, this one wins and the other is wrong.
3. Check `git log --oneline -5` and `git status`. The history is the durable record; `docs/status.md` only summarizes it.

Then read as needed: [docs/roadmap.md](docs/roadmap.md) for sections and what each next step waits on, [docs/architecture.md](docs/architecture.md) for identity, the database boundary, concurrency and audit, [CHANGELOG.md](CHANGELOG.md) for every release mapped to its section and migration, and [docs/school-information-requests.md](docs/school-information-requests.md) for what the school still owes us.

`docs/manuscript-analysis.md` explains where the requirements came from and which of them turned out to be contradictory. The manuscript itself is **not** in this repository and must never be committed.

## End of session

Before you stop, leave the project pickup-ready for a different agent:

- **Commit finished work.** An increment is one commit. Never leave a half-finished module uncommitted without saying so in `docs/status.md`.
- **Update `docs/status.md`**: current version, last commit, what just shipped, the single next action, anything in flight, and any question waiting on the user. Keep it short — it is a pointer, not a second changelog.
- **Record decisions** in the settled-decisions table in `docs/constraints.md`, with the date. A decision that lives only in a chat transcript is lost the moment the tool changes.
- Leave the working tree clean, or explain in `docs/status.md` exactly what is dirty and why.

## Rules that do not bend

- **Never modify an applied migration.** They are checksummed and the runner refuses a changed file. To alter a deployed function, `create or replace` it in a **new** migration. Migrations `0018`, `0019` and `0021` each do this; follow that pattern.
- **Never invent DepEd policy.** No grading weights, transmutation table, rounding rule, passing mark or numeric Kindergarten grading. If a rule is not in `docs/constraints.md` as settled, it is not ours to choose. A wrong rule here silently corrupts real report cards.
- **Never weaken a backend control to make a frontend workflow easier.** The API is the authority; the UI is a convenience over it.
- **Never commit or print credentials** from `.env` or `.local/`. Scratch scripts that need them run from `.local/` and are deleted afterwards.
- **Synthetic data only** in tests, and roll back anything written to a hosted database.
- **Managers change learner records; teachers read only their currently assigned learners.** This was an explicit decision where the manuscript contradicted itself.
- **Absence of a record is not evidence.** An unmarked attendance session and an unrecorded score are `null`, never zero and never "present". Several modules exist specifically to preserve this.
- **Nothing computes a grade.** No total, average, percentage, MPS, GWA or transmutation exists anywhere, including client-side in the UI. This is blocked deliberately, not an oversight.

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
- Use an identity column, not a random uuid, for any journal paged newest-first. A uuid cursor is not chronological, and the resulting bug only shows up under a full test run.
- Do not shadow a column name with a PL/pgSQL variable. A local named `value` inside `for ... in select value from jsonb_array_elements(...)` is ambiguous and fails at runtime, not at creation.

### Error code ranges

`P0002` not found and `P0003` version conflict are shared. Module ranges: `P01xx` timeline, `P02xx` identity, `P03xx` enrollment records, `P04xx` placement, `P05xx` calendar, `P06xx` attendance, `P07xx` months, `P08xx` monitor, `P09xx` follow-ups, `P10xx` subjects, `P11xx` offerings, `P12xx` policy drafts, `P13xx` adoptions, `P14xx` bindings, `P15xx` invitations, `P16xx` assessment tasks and scores. **Next free range: `P17xx`.**

### Frontend

The workspace is a Vite + React + TypeScript app in `web/`, built into `public/` and served by the API at `/app`. `web/api.ts` throws an `ApiError` carrying the server's own `code`, so screens react to specific codes rather than message text. `web/ui.tsx` holds the shared `Editor`, `Finder`, `Table`, `OffsetPager`, `Action` and `StatusLine`. Screens take `{ api, setStatus, reload, token }` and refetch on `token`. See [docs/frontend-handoff.md](docs/frontend-handoff.md) for every unbuilt screen and the rules it must respect.

Sessions live in `sessionStorage`. Do not move them to `localStorage`.

### Style

Backend module and migration code is deliberately dense — multiple statements per line, minimal whitespace. Frontend code is conventionally formatted. Match the surrounding file rather than reformatting it. Comments are rare and explain *why*, not what.

## Commands

```bash
npm run check        # typecheck, tests, build. Must pass before commit.
npm run api:export   # regenerate docs/openapi.json after a contract change
npm run db:migrate   # apply pending migrations (needs the operator credential)
npm run dev          # local API on http://127.0.0.1:3001
npm run dev:web      # Vite dev server, proxying /api to 3001
```

Tests use PGlite and need no Docker or cloud credentials. The full suite takes about 90 seconds; run it in the background rather than blocking on it. A Claude Code session may see these commands rewritten by a local `rtk` proxy; that is a harness detail and changes nothing about what runs.

## When instructions conflict

Ask. `docs/constraints.md` exists because a briefing once described the state of the system in words that read like a prohibition, and the difference decided whether a whole module should be built. If a request and that file disagree, raise it in a sentence and wait — a wrong guess is expensive in a system that will hold real learner records.
