# Development deployment and operations

## Current development deployment

**0.29.0 was released on 21 September 2026**, aliased to https://edunexus-balili.vercel.app. It carries migration `0022`, the authorized corrective migration for the score defects in the [20 September review](backend-review-2026-09-20.md). The migration is applied to the hosted database before the application deploy, because 0.29.0's score reads write `record_access_events` rows the old check constraint would reject.

**Nothing deploys on a push.** The Vercel project is not git-connected, so `git push` runs CI and ships nothing. `npx vercel --prod --scope joshs-projects-47d7b071` from the repository root is the deploy, and it is the last step of every release rather than a separate errand. A bare `vercel` without the scope may answer Not authorized.

## The hosted environment

This section is the durable record of where EDUNEXUS runs. It was lost when the release narrative was trimmed on 20 September and is restored here without the per-release history, which belongs in [the changelog](../CHANGELOG.md).

- **Supabase** project `edunexus`, reference `eszhhtxzrplknrmzozwr`, created 9 September 2026 in the existing account organization, in Singapore.
- **Vercel** project `edunexus` under `joshs-projects-47d7b071`, public address https://edunexus-balili.vercel.app. The shorter name belongs to another project; the previous address forwards for existing bookmarks.
- **GitHub**: the private repository https://github.com/bustamante-j/edunexus.

Applied Supabase auth configuration, verified through `supabase config diff` against `supabase/config.toml`:

1. Public signup disabled, minimum password length 12, access-token lifetime 15 minutes. The public JWKS advertises ES256.
2. The auth callback is `https://edunexus-balili.vercel.app/account/setup`. Allowed redirects are that exact URL and `http://127.0.0.1:3001/account/setup`.
3. Seven runtime variables are configured in the **production environment of the development Vercel project** — Vercel's stable environment name, not the school's production rollout. Database TLS is required and verified.

**Never run `supabase config push`.** The pull deliberately skipped settings it cannot represent, so a push would write local defaults over them, including disabling Twilio. The Email provider toggle is not in that schema at all.

Credentials: the restricted database credential is held in ignored local files and in Vercel's runtime environment. The privileged migration connection and the Supabase service-role key stay local and never reach the API runtime — the service-role key is confined to the isolated `create-staff-identity` Edge Function, which can only invite one address. Scratch scripts that need any of these run from `.local/` and are deleted afterwards.

## Releasing

1. `npm run check` — typecheck, tests and build must pass.
2. `npm run db:migrate` if the release adds a migration. The runner is checksummed and refuses a modified applied file; it applies pending files in one transaction.
3. `npx vercel --prod --scope joshs-projects-47d7b071`.
4. Live checks: `/health/live`, `/health/ready` and `/app` return 200, `/openapi.json` reports the released version, and every documented protected operation rejects an anonymous request with 401.

## What the hosted checks do and do not establish

Hosted read-only metadata checks have confirmed that every applied migration checksum matches, that the domain tables carry RLS and are not owned by the runtime role, that no domain table grants SELECT to `anon` or `authenticated`, and that security-definer functions have fixed empty search paths and no PUBLIC execute. Synthetic hosted fixtures have exercised the restricted role, date serialization, teacher isolation, version checks, concurrent transaction contexts and audit writes, and every one was rolled back.

None of that is school-production acceptance. **Still unverified:** a real staff sign-in, the account Edge Function in the deployed workflow, SMTP for broad onboarding, realistic multi-session load, backup restoration into an isolated project, privilege revocation and deployment rollback drills. No learner record has ever been imported, and none may be until the privacy owner in [the information requests](school-information-requests.md) is named.
