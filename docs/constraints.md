# Standing rules, gates and settled decisions

This is the single source of truth for what EDUNEXUS may not do, what it cannot do yet, and what has already been decided. Read it before [the roadmap](roadmap.md): where the two disagree, this file wins and the roadmap is wrong and should be corrected.

It exists because "not built yet" and "must never be built" are different statements that read alike in a requirements list. A rule below is permanent. A gate is a thing that is blocked, by a named decision, held by a named party. Anything in neither table is ordinary work.

## Standing rules

Never violate these. Changing one takes an explicit written instruction, recorded in the table.

| Rule | Why | Changed by |
|---|---|---|
| Principals and administrative officers change learner records; teachers read only their currently assigned learners | The manuscript's two statements conflicted and the user chose manager-only. A teacher-accessible unassigned pool is not implemented. | User instruction, then a revised workflow |
| Never weaken database permissions, version checks or audit history to make a workflow easier | These are the correctness and privacy boundary, not an implementation detail | Nothing short of a redesign |
| Never modify an already-applied migration; add a new one | Applied migrations are checksummed and the runner refuses a modified file | Nothing |
| Never commit or expose credentials from `.env` or `.local` | Real school deployment secrets | Nothing |
| Use synthetic data in tests, and roll back hosted test fixtures | Real learner data is sensitive personal information under the Data Privacy Act | Nothing |
| Do not invent official grading rules, weights, transmutation or numeric Kindergarten grading | EDUNEXUS is not the authority on DepEd policy; a wrong rule silently corrupts real report cards | The school supplying the rule, via the grading gate below |
| The manuscript stays in its original location and is never committed | It is source material, not a repository artifact | Nothing |
| Do not weaken backend controls so a frontend workflow is easier to build | The API is the authority; the UI is a convenience over it | Nothing |

## Gates

Each of these is blocked on information EDUNEXUS cannot derive. Do not build past one. Do not approximate it with a default.

| Gate | What it blocks | Who decides | Opened by |
|---|---|---|---|
| **Absence-alert rule** | Automatic alerts, thresholds, notifications, any messaging on attendance | School | A written approved rule. The school has confirmed it has none. |
| **Grading enclosure and ECR examples** | Score entry, component arithmetic, rounding, transmutation, MPS, GWA, subject and section averages, reviewed finalization | School, plus the current DepEd enclosure | The verified current enclosure and the school's own ECR examples, reconciled together |
| **Kindergarten assessment policy** | Any numeric Kindergarten grading or report output | School | An explicit approved Kindergarten policy. Grade `0` means Kindergarten, never a numeric grading target. |
| **Mark meanings and conversion rules** | Official SF2/SF4 arithmetic, half-day credits, alternative-delivery participation and conversion | School | Approved AM/PM mark meanings, half-day rules, transfer effective-date rules and conversion rules |
| **Official form templates** | Section 6 rendering, release snapshots and signatories for SF2, SF4, SF9, SF10 | School | Blank approved templates, named signatories, and a release/correction process |
| **Learner fields and class capacity** | Registry acceptance, additional profile fields, capacity enforcement, school-reviewed sample mappings | School | A reviewed field list and capacity policy |
| **Real staff sign-in and school acceptance** | Hosted acceptance sign-off for Section 1 | School and the deployment operator | A completed invited-user password setup and an authenticated API check |
| **Load and recovery verification** | Section 7 turnover | Operator, with targets agreed with the school | 27+ concurrent session testing, backup restoration into an isolated project, privilege revocation and rollback drills |
| **Privacy owner and approved purposes** | Importing any real learner data | School | A named privacy owner, approved purposes and fields, hosting arrangements, recovery objectives and a tested restore |
| **Service-role key in the runtime** | Nothing currently built. Any feature needing the key *in the API runtime*, such as deleting or altering an existing identity | School and the deployment operator | An explicit written decision accepting that a compromised runtime could then create, alter or delete any Auth identity. Account creation no longer needs this: the key is confined to an isolated Edge Function that can only invite an address. |

## Settled decisions

Recorded so they are not re-litigated each session.

| Date | Decision |
|---|---|
| 2026-09-17 | "Assessment policies are drafts only" in the v0.15.0 briefing **described the state at that release**; it did not forbid building approval. Section 4A.4 adoption is in scope and stays. Section binding and grade calculations remain separate: binding is the next increment, calculations stay behind the grading gate. |
| 2026-09-19 | **Every release is deployed to Vercel before the session ends.** The user asked for it directly: a change that is committed but not deployed is not a change they can see. The project is not git-connected, so a push ships nothing — `npx vercel --prod --scope joshs-projects-47d7b071` from the repository root is the deploy, and it is part of finishing the work, not a separate errand. |
| 2026-09-18 | Cloud hosting on Vercel and Supabase was chosen by the operator. The paper makes the deployment approach a client decision, so this awaits school confirmation and interacts with the privacy gate. |
| 2026-09-18 | A manager can create a faculty account in the app, satisfying the manuscript's first functional requirement (Table 1, User Management). The service-role key stays out of the API runtime: it is confined to the `create-staff-identity` Edge Function, whose only action is inviting one address. The service-role gate is therefore avoided, not opened, and the operator link-by-UUID route stays for deployments with no function configured. |
| 2026-09-18 | Multi-factor authentication is removed. A full read of the manuscript found no mention of MFA, an authenticator, TOTP, OTP or a second factor anywhere; its only security requirements are Data Confidentiality and role-based Access Control. Sign-in is email and password. The user was shown that the paper also never mentions passwords, so omission is not prohibition, and chose removal anyway. Reinstating it is a code change, not a configuration switch. |
| 2026-09-19 | The workspace is a **deep navy rail against white working surfaces**, with blue as the single accent — the same hue as the rail at a lighter depth, so the current navigation item, the primary button and the chart ramp are one colour at four strengths. The rail is the only dark region, because navigation is furniture and records are the content. Rail text uses `--rail-ink`/`--rail-dim`/`--rail-faint`, contrast-checked against the rail, never the `--ink-*` scale. **Amended 2026-09-19 (0.27.1)**: the rail is 296px wide, its blue is saturated rather than desaturated navy, and `--rail-ink` and `--rail-dim` are both white — hierarchy inside the rail comes from size and weight, not from dimming text. `--rail-faint` remains a step down and remains icons-and-rules only. This **supersedes the pine-green white interface** decided 2026-09-18; the user supplied their own earlier prototype as the reference and asked for its colour and shell, explicitly not its contents. Type is unchanged: Inter throughout, JetBrains Mono for identifiers, both self-hosted, no font CDN. |
| 2026-09-19 | The workspace has **no notification bell and no alert badge**, though the supplied reference has one. The absence-alert gate blocks "any messaging on attendance", so nothing in the system may raise an alert; a badge would be decoration imitating a signal. Add one when a rule exists to fire it. |
| 2026-09-19 | The **Overview screen reads no learner or enrollment record**. Every list under `/learners` and `/enrollments` writes a `record_access_events` row naming the exact records returned, so counting 897 enrolments on each dashboard load would bury the privacy audit under its own noise and defeat the control. A tile needing a learner count requires an aggregate endpoint returning a number without naming records; paging the registry to count is not an acceptable substitute. |
| 2026-09-19 | The reference prototype's headline figures — a general average, an academic-standing ring and an attendance rate — were **not** reproduced. Grade arithmetic sits behind the grading enclosure gate and attendance rates behind the mark-meanings gate. The screen keeps the layout, fills it with facts the system may state, and names the absence explicitly rather than leaving it to be guessed at. The user chose this over both showing the numbers and showing locked tiles. |
| 2026-09-19 | **Every corner in the system is square.** The four radius tokens are `0` and nothing rounds a corner independently of them — no `999px` pills, no rounded chart geometry. The tokens keep their names so the scale tunes from one place if this is ever softened. The user asked for it directly: "not a fan of smooth edges". |
| 2026-09-19 | The **EDUNEXUS mark is inline SVG** in `web/components/brand.tsx`, a vector redraw of the artwork the user supplied as a PNG. It is not the PNG, and `img-src` was **not** added to the content policy to make it one — that would be weakening a backend control for an interface convenience. The original and an export of the redraw live in `docs/brand/`, which is tracked; `public/` is build output, is wiped by `emptyOutDir` and is gitignored, so nothing may be stored there. **Amended 2026-09-19 (0.27.2)**: the user was asked to choose between the exact PNG and an unbroken policy and chose the tab icon, so `img-src 'self'` was added **for the favicon alone** and `web/public/favicon.svg` is a third cut of the same geometry — white ground, no sub-pixel notches, because a 16px tab loses both. Nothing in the interface loads an image file, and the redraw still ships as the mark everywhere on screen. Re-cutting the mark means editing all three SVGs together and comparing them against the PNG. |
| 2026-09-18 | The workspace is a white interface: white surfaces on a near-white canvas, hairline separation rather than shadow, pine green as the single accent. Type is Inter throughout, with JetBrains Mono reserved for identifiers because a twelve-digit LRN is transcribed from paper and `0`/`O` must be distinguishable. Both self-hosted; no font CDN, so no staff address reaches a third party. The user supplied a reference product for the typography and organization, and that reference governs where it and this table disagree. **Superseded by the 2026-09-19 navy-rail decision above for colour only**; the typography and hairline-separation rules still stand. |
| 2026-09-18 | A screen gets one clause of description, plus the DepEd form the records end up on. The table a screen writes is developer detail and is not printed; the permission level is already answered by the navigation hiding what a teacher cannot open. **Amended 2026-09-19**: the title moved into the top bar, so the page header now carries only the clause and the form chip. A screen drawing its own heading — currently only the Overview, whose greeting block is its header — sets `ownHeader` on its route and the shared header is skipped. |
| 2026-09-18 | The workspace content policy is `default-src 'none'` and stays there. It is **not** relaxed for interface convenience, so there are no images at all — including `data:` URLs in CSS — and no inline `style` attributes. Both fail silently in production while working under the Vite dev server, which is how they went unnoticed until 0.26.0. Selects go through the `Select` primitive; icons are inline SVG in `web/components/icons.tsx`. Since 0.27.0 both are asserted in `tests/web-shell.test.ts`, and charts are hand-drawn SVG for the same reason — a canvas or background-image charting library cannot render under this policy. **Amended 2026-09-19 (0.27.2)**: the policy carries exactly one `img-src`, `'self'`, added for `/favicon.svg` on the user's instruction. It admits no `data:` and no remote origin, this origin serves only the built bundle, and no screen loads an image file — so the rule above is unchanged in practice. Widening that directive further needs a decision recorded here; `tests/foundation.test.ts` fails if it is widened quietly. |
| 2026-09-18 | Frontend work is no longer deferred. The workspace is a Vite + React app with sessions in `sessionStorage`; the API is far ahead of the interface and the TAM evaluation measures the interface. |
| 2026-09-17 | Staff invitations are tracked in EDUNEXUS, but identity creation stays with the operator. The runtime holds no service-role key. |
| 2026-09-17 | Adoption records a school decision, not a correctness judgement. `adoption_reference` is the school's own record of the decision and is never treated as proof the content is right. |
| Section 2A | Managers make all learner record changes; teachers read only currently assigned learners. No automatic duplicate merge exists. |
| Section 1 | One adviser per section. Subject-teacher access is not invented. |
| Section 3 | Attendance counts are raw session counts, never official attendance credits, until the mark-meanings gate opens. |

## Handing the project over

[AGENTS.md](../AGENTS.md) is the working contract, read by Codex directly and by Claude Code through a one-line `CLAUDE.md` pointer, so both tools get identical instructions. [status.md](status.md) records where the last session stopped.

A decision that lives only in a chat transcript is lost the moment the tool changes. Record it in the settled-decisions table below, with the date.

## Asking the school

[School information requests](school-information-requests.md) turns the gates above into the actual questions to ask, in priority order, with what a sufficient answer looks like. Request 1, the grading enclosure and ECR examples, is the critical path: it alone opens roughly ten increments.

Filled ECR files and form samples contain real learner names and grades. Ask for them redacted, keep them in the ignored local working area, and never commit them.

## Using this file

When planning an increment, check the gates first. If the work sits behind a closed gate, it is blocked; say which gate and stop, rather than approximating the missing decision. Every **Next:** line in [the roadmap](roadmap.md) names the gate it depends on, or states that it has none.

When the user's instructions and this file disagree, ask before building. That ambiguity is what this file exists to remove, and a wrong guess is expensive in a system that will hold real learner records.
