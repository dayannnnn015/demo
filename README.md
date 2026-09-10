# EDUNEXUS backend

EDUNEXUS supports learner attendance and academic records for Balili Elementary School, La Trinidad, Benguet. This repository currently implements **Section 1: staff authorization and school configuration**. Backend development remains the priority; a basic [school workspace](https://edunexus-backend-dev.vercel.app/app) now makes the existing operations usable through forms. Full frontend design is deferred.

The manuscript has been analyzed and the work is divided into reviewable sections. Read [the manuscript analysis](docs/manuscript-analysis.md), [implementation roadmap](docs/roadmap.md), and [architecture](docs/architecture.md) before extending it.

## What works in Section 1

- Supabase staff token verification with signature, issuer, audience, expiration, MFA, and live identity checks.
- Principal, administrative officer, and teacher permissions, enforced in the API and PostgreSQL row-level policies.
- Staff authorization, updates, suspension, and protection against self-lockout or removing the last principal.
- School profile, draft/active/closed school years, configurable reporting periods, and Kindergarten–Grade 6 sections with adviser assignments.
- Teacher access restricted to their assigned sections.
- Version checks to prevent lost updates, transactional audit records, and persistent request limits.
- Versioned SQL migrations, an OpenAPI contract, automated tests, CI, and Vercel configuration.

Learner records, attendance, grading, promotion, and form generation are subsequent sections. No learner data has been imported. The development Supabase schema is provisioned and tested, and the backend is deployed at [edunexus-backend-dev.vercel.app](https://edunexus-backend-dev.vercel.app). The initial administrator invitation was accepted by Supabase for delivery, and the school/account bootstrap is complete. Live route checks pass; the invited user's password/MFA enrollment remains to be verified. See [deployment](docs/deployment.md).

## Development

Requirements: Node.js 24, npm, and a dedicated Supabase development project. Automated database tests use PGlite and do not need Docker or cloud credentials.

```powershell
rtk proxy npm.cmd ci --ignore-scripts
rtk proxy npm.cmd run check
rtk proxy npm.cmd run api:export
```

For an API connected to Supabase, copy `.env.example` to `.env` and complete the deployment setup below. Do not use a privileged database URL as `DATABASE_URL`.

```powershell
rtk proxy npm.cmd run db:migrate
rtk proxy npm.cmd run db:credentials
rtk proxy npm.cmd run db:bootstrap
rtk proxy npm.cmd run dev
```

The local API listens on `http://127.0.0.1:3001`. `npm run build` compiles the backend; `npm start` runs that build. The live runtime uses PostgreSQL, never the PGlite test fixture.

## API

The machine-readable contract is [docs/openapi.json](docs/openapi.json) and is served at `/openapi.json`. [Frontend integration](docs/frontend-handoff.md) explains authentication, response envelopes, dates, pagination, and version conflicts.

All business endpoints are under `/api/v1` and require `Authorization: Bearer <Supabase access token>`. `/`, `/health/live`, `/health/ready`, `/openapi.json`, `/app`, and the account setup/configuration endpoints are public and return no personal records. `/app` and `/account/setup` share password/MFA sign-in and open the Section 1 workspace after authentication. The workspace supports school profile edits, staff authorization/access updates, school years, reporting periods, sections/advisers, and activity history. Sessions remain in memory, so refreshing requires signing in again. Readiness checks the database, restricted runtime role, school bootstrap, and rate-limit function; it does not certify an end-to-end Supabase login.

## Repository layout

```text
src/core/                 Authentication, configuration, database, errors
src/modules/foundation/   Section 1 contracts and business operations
src/http-app.ts           HTTP boundary and route registration
database/migrations/     Ordered, immutable SQL migrations
scripts/                 Migration, operator setup, API export
tests/                   PostgreSQL, API, and signed-token tests
docs/                    Requirements, decisions, deployment, API handoff
```

Passwords, tokens, database URLs, and manuscript extracts belong only in ignored `.env`/`.local` files. The manuscript remains in its original location and is not committed into this repository.
