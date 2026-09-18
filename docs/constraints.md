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
| **Service-role key in the runtime** | In-app Auth identity creation | School and the deployment operator | An explicit written decision accepting that a compromised runtime could then create, alter or delete any Auth identity. Until then, the operator provisions identities and EDUNEXUS only records the invitation. |

## Settled decisions

Recorded so they are not re-litigated each session.

| Date | Decision |
|---|---|
| 2026-09-17 | "Assessment policies are drafts only" in the v0.15.0 briefing **described the state at that release**; it did not forbid building approval. Section 4A.4 adoption is in scope and stays. Section binding and grade calculations remain separate: binding is the next increment, calculations stay behind the grading gate. |
| 2026-09-18 | Cloud hosting on Vercel and Supabase was chosen by the operator. The paper makes the deployment approach a client decision, so this awaits school confirmation and interacts with the privacy gate. |
| 2026-09-18 | Multi-factor authentication is removed. A full read of the manuscript found no mention of MFA, an authenticator, TOTP, OTP or a second factor anywhere; its only security requirements are Data Confidentiality and role-based Access Control. Sign-in is email and password. The user was shown that the paper also never mentions passwords, so omission is not prohibition, and chose removal anyway. Reinstating it is a code change, not a configuration switch. |
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
