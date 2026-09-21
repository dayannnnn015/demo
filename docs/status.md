# Where things stand

**Updated:** 2026-09-20 · **Version:** 0.28.1 · **Last commit:** see `git log -1` (maintenance follows `fe486ad`) · **Branch:** master

## Current work

The user paused frontend development and requested an existing-backend review with fixes and testing. No new academic feature or school-policy decision is authorized. The [review report](backend-review-2026-09-20.md) is the durable record of findings and limitations.

Maintenance fixes validate successful upstream Auth/account-service responses, require safe deployed provisioning transport, explain ambiguous external account outcomes and accept legitimate decimal raw marks without rounding. Additional tests verify denial of school access after an external identity call followed by a journal failure. No endpoint, migration or P17xx code is added. All 21 existing migration checksums were independently verified against Supabase; 44 domain tables have RLS and no public Data API read grants. All 109 live protected routes rejected anonymous requests.

## Single next action

**Resolve authorization for a corrective migration.** The handoff prohibited new migrations. Newly reproduced score defects require one: withdrawn-learner access/write protection, missing raw_score silently clearing a mark, missing score-read privacy journals, and the API/storage mismatch at maximum 10000. Lock ordering also needs a multi-connection concurrency regression. The clarification is pending; do not treat silence as approval or modify an applied migration. Detailed reproductions are in the review report.

## Verification and in flight

All 303 tests across 23 files, server/web type checks and production build passed. The runtime dependency audit reported zero vulnerabilities. Maintenance release 0.28.1 is deployed as `dpl_Fq5z2XjRih6c33aSnNC6UpAejFwX`; live version, all 109 protected routes and readiness checks passed. GitHub CI status is available for the current commit; no development work is in flight. No school records or real Auth identities were created; no email was sent. The authenticated browser workflow, account Edge Function, multi-session load and restore exercise remain unverified.

## Still outstanding

- Score entry remains named in the closed grading gate, despite the existing raw-score implementation. The policy contradiction is unresolved; reviewing defects does not open it.
- First real manager password setup/sign-in remains unverified. Account provisioning needs its isolated Edge Function deployment/configuration and real workflow verification; the API runtime must never receive a service-role key. SMTP setup is needed before broad onboarding.
- School questions and partially supplied SF2/SF4/SF9 evidence are in [school-information-requests.md](school-information-requests.md) and [school-forms.md](school-forms.md). The supplied forms do not settle grading, session-to-day attendance conversion, the absence threshold, cross-section teacher access, privacy approval or recovery targets. Keep the filled forms and manuscript out of Git.
- No school facts were entered during this review. Academic-year dates/address and subject/MAPEH interpretation still require the checks documented in school-forms.md.
- The frontend remains v0.28.0's workspace implementation. Calendar, daily attendance and later screens are deferred while the user focuses on backend maintenance. Preserve [the frontend contract](frontend-handoff.md).

## Release procedure

GitHub was synchronized at `fe486ad` before this review. Pushing does not deploy: Vercel is not git-connected. Release with `vercel --prod --scope joshs-projects-47d7b071`; a bare command may report Not authorized. The maintenance release is committed and the tree is clean; check the current commit’s GitHub workflow for its final CI result.
