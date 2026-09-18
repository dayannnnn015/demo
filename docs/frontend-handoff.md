# Frontend integration contract

The workspace is a Vite + React + TypeScript application in `web/`, built into `public/` and served by the API at `/app`; `/app` and `/account/setup` are the same page. Keep calculation, permission, finalization, and record-transition rules in the backend. Read `docs/openapi.json` or `GET /openapi.json` for the current contract. Sections 1, 2A, 2B.1, 2B.2, 2B.3, 2B.4 and 2B.5 are implemented in the API. The workspace now also reads the Section 2A learner registry; import and correction screens are not yet built.

## How the app is put together

The workspace is organized as a route table in `web/routes.tsx`. A route carries its navigation label, title, one-line explanation, the record class it holds, the official form it feeds, its permission level and whether an interface exists yet. Adding a screen means adding a route and a component; the shell, navigation grouping and page header follow from the table, and a module with no screen yet renders an honest placeholder rather than disappearing.

`web/styles/tokens.css` holds colour, type, spacing and elevation. Use the tokens rather than literal values: the palette carries meaning, with ochre for "needs attention" and red reserved for blocked actions, so a red control in a new screen should mean something is genuinely stopped. Fonts are self-hosted in `web/fonts`; do not switch to a font CDN, because the policy is same-origin and staff addresses should not reach a third party.

`web/components/primitives.tsx` holds `Editor`, `Finder`, `Table`, `Badge`, `Callout`, `EmptyState`, `Pager`, `Button` and `StatusLine`. Prefer them over new markup so screens stay consistent, and give every table a real empty state: an empty screen is where a staff member decides whether the system is broken or simply new.

`web/main.tsx` creates the Supabase client from `/account/config` and decides between the account flow and the workspace. `web/api.ts` wraps every call: it attaches the bearer token, unwraps the `{ data, requestId }` envelope, and throws an `ApiError` carrying the server's own `code`, so a screen can react to `VERSION_CONFLICT` or `TASK_COMPONENT` specifically rather than matching on message text. `web/components/primitives.tsx` holds the shared primitives — `Editor` for versioned saves, `Finder` for filters, `Table`, `Badge`, `Callout`, `EmptyState`, `Pager`, `Button` and `StatusLine`. Screens live in `web/screens/` and are declared in `web/routes.tsx`.

`tests/web-screens.test.ts` renders every route once against an API that returns nothing, and asserts that no column or field is labelled with a computed grade. Effects do not run in that pass, so it covers the empty and loading states rather than the data paths behind a fetch. A signed-in browser check is still the only way to exercise those.

Add a screen by writing a component that takes `{ api, setStatus, reload, token }`, fetching in a `useEffect` keyed on `token` so a save refreshes it, and registering it in `web/Workspace.tsx`. Run `npm run dev:web` next to `npm run dev` for hot reload; the Vite dev server proxies `/api` to port 3001.

Sessions are kept in `sessionStorage` under `edunexus-session`. A refresh keeps the user signed in; closing the tab ends the session. Do not move this to `localStorage` — these are staff tokens for a system holding sensitive learner data, and the exposure window matters more than the convenience.

Static bundle files are served before the CORS middleware, because a `type="module"` script is always fetched in CORS mode and the API origin allowlist would otherwise reject the workspace's own bundle.

## Authentication

Use Supabase's official client to sign in, refresh sessions, and recover accounts. The frontend receives only the Supabase URL and publishable key. The API receives the Supabase access token in the `Authorization` header. Do not use a service-role key, database credential, or custom JWT in the browser.

There is no public EDUNEXUS registration. A managed Auth identity must also have an active `edunexus.staff` record. On launch, call `/api/v1/me`. Treat `STAFF_ACCESS_REQUIRED` as an unapproved/suspended school account. User metadata does not authorize features. Use API permissions as the final authority even if buttons are hidden.

The account page accepts invitation and recovery fragments, removes them from browser history and sets a password, then opens the workspace once `/api/v1/me` succeeds. It also offers "Email me a recovery link", which calls Supabase from the browser and answers identically whether or not an address is registered. Sign-out clears rendered school records; an expired or suspended session returns to sign-in. The frontend still needs its own complete account-management/recovery experience. Configure exact Auth redirect allowlists and API CORS origins. Reset links must remain on trusted routes. Follow the current Supabase Auth documentation when implementing session storage for the chosen frontend framework.

The workspace has role-aware navigation, named adviser choices, paginated staff/section lists, cursor-based activity history, loading/retry messages, validation errors, and forms that retain edits after failed saves. PATCH requests include the displayed record version. Closing a year requires a confirmation. All displayed record text is assigned through DOM text properties, never inserted as HTML. UI permissions supplement the existing API and PostgreSQL checks.

## Requests and responses

Successful business responses use `{ "data": ..., "requestId": "uuid" }`. Errors use `{ "error": { "code": "...", "message": "..." }, "requestId": "uuid" }`. Validation errors may include `error.fields` entries with a dotted path and display message. Preserve the request ID when reporting a problem; never attach a token or raw learner data.

```http
PATCH /api/v1/sections/00000000-0000-4000-8000-000000000010
Authorization: Bearer <access-token>
Content-Type: application/json

{"version":1,"name":"Daisy"}
```

The API uses snake_case field names. Send JSON, not form-encoded bodies. Unknown fields are rejected. POST returns 201. PATCH requires the latest `version`. On `VERSION_CONFLICT`/409, reload the record and let the user reconcile their change; do not silently retry it against a newer version. Retried creates may return `ALREADY_EXISTS`; reload the appropriate list to inspect the existing record.

List endpoints for staff and sections return `data.items` and `data.pagination` with `limit`, `offset`, and `has_more`. Maximum page size is 100. Years/periods are naturally bounded lists and return `items`. Audit events use string IDs to avoid JavaScript integer precision loss and a descending `next_before_id` cursor. Pass it as `before_id` for the next page.

Dates are exact `YYYY-MM-DD` calendar dates in the school's Asia/Manila context. Avoid converting them through local timezone `Date` arithmetic. Audit timestamps are UTC ISO timestamps and may be displayed in Asia/Manila. Grade level `0` means Kindergarten.

## Permissions and available flows

| Flow | Principal | Administrative officer | Teacher |
|---|---|---|---|
| Read school profile/years/periods | Yes | Yes | Yes |
| Configure school/years/periods | Yes | Yes | No |
| Manage teacher access | Yes | Yes | No |
| Manage administrative access | Yes | No | No |
| Create/reassign sections | Yes | Yes | No |
| Read sections | All | All | Assigned sections only |
| Read change audit | Yes | Yes | No |
| Read learner profiles | All | All | Currently assigned learners only |
| Read annual enrollment records | All | All | Currently assigned learners only |
| Register learners and record movements | Yes | Yes | No |

Show draft school-year setup before activation. Allow period corrections only in draft years. Explain that closed years are immutable. [Section 2A](learner-registry.md) supports learner profiles, annual enrollment, current rosters, and movement history. Managers edit; teachers only view current assigned open-year rosters. Keep LRNs as strings, display pending for null, and never generate identifiers or silently merge matching names. Movement requests use the enrollment version and first date of the new state. [Section 2B.2](enrollment-timeline.md) supports reviewed historical corrections; classroom attendance is now available through the Section 3B.1 API, while grades, report exports, and in-app invitations remain unavailable.

## Staff invitation screens to build

[Staff invitations](staff-invitations.md) are manager-only. The workspace still authorizes a bare UUID through `POST /staff`; the tracked flow is API-only so far. A screen should show outstanding requests with their intended permission level, let a manager record a new request, and let them paste the operator's returned identifier into a provision action that carries the current invitation version.

Present provisioning honestly: EDUNEXUS does not send the invitation email and cannot create the identity. The operator does that in Supabase, and `INVALID_REFERENCE` means the identifier does not exist there yet. `INVITATION_STATE` means the request was already completed or cancelled, and `ALREADY_EXISTS` means either an open request for that email or an identity that already holds school access. Administrative officers see requests for any level but may only act on teacher ones.

Recovery is already live on the sign-in page and uses the browser's Supabase client, not the API. Keep its reply identical whether or not an address is registered; a differentiated message would let a visitor probe which addresses exist.

## Learner registry and enrollment screens

Registration, profile correction, LRN assignment, enrollment and movements are built, manager-only, and version-checked. Two rules carried into the interface are worth keeping if these screens are reworked. A pending LRN is left blank rather than given a placeholder, and assignment is offered only while it is still null, because the API accepts it once and never clears it. A movement is a dated event whose fields depend on the action, so it is a form rather than a row of buttons: withdrawal takes a reason and no section, a move or re-entry takes a section and no reason, and the section list is filtered to the same grade and year because nothing else is accepted.

**Still API-only.** These screens deliberately do not offer: correcting an LRN that was already assigned, repairing a recorded movement or its dates, voiding and restoring an annual record, correcting a whole-year grade placement, merging duplicate learner records, or importing a class list from a file. Each is a reviewed workflow with preview, hash and confirmation semantics that a plain form would misrepresent. Both screens end with a note naming them, so a walkthrough does not read a missing screen as a missing capability.

## Learner registry screens

The workspace has a read-only **Learners** tab for every role, built on [Section 2A](learner-registry.md). It searches `GET /learners` with the documented `search`, `lrn` and `birth_date` filters, pages 25 rows at a time by `offset`, and loads a learner's `GET /enrollments?learner_id=` records only when a staff member opens that row, because every successful read appends a record-access event.

The tab is deliberately read-only. Registration, LRN assignment, enrollment, movements and every reviewed correction stay API-only until their review screens exist; do not add a mutation button that skips the version and reason a workflow requires. A teacher who opens the tab receives only their currently assigned learners from the API, and the page says so rather than implying the registry is empty. Render pending LRNs as `Pending` instead of a blank cell, show Kindergarten by name rather than grade `0`, and keep `record_state=voided` rows labeled as unusable for reporting. Managers request `record_state=all` to see voided evidence; teachers must not.

Section and school-year names are resolved from `/sections` and `/academic-years` for display only. A missing entry means the row is outside the reader's scope, so it shows as unavailable rather than as a database identifier. Learner names, LRNs and birth dates are rendered as text and cleared on sign-out with the rest of the workspace.

## Import and LRN review screens to build

[Section 2B.1](registry-review.md) supplies the connected import/correction APIs. Download the template through `GET /api/v1/roster-imports/template`, select an existing section and enrollment date, and keep CSV content only in memory. Preview must show normalized rows, target details, candidate records, row issues, and explicit duplicate resolutions. Re-preview after editing any input. Enable confirmation only when `can_commit=true`; submit the identical payload with `confirmed=true` to the returned preview ID's commit route. Do not reconstruct CSV from displayed rows between preview and commit.

On a lost response, retry the same preview ID and payload or fetch its receipt. Never silently create a new preview and commit it. On `PREVIEW_CHANGED` or expiry, require fresh review. Only the same manager can commit/read their preview; sign-out must clear pending CSV and displayed candidates. Templates use the minimum EDUNEXUS fields, not arbitrary XLSX/LIS mappings.

For LRN correction, show the current LRN and version, collect the corrected value and reason, and obtain explicit manager review before posting `reviewed=true`. Refresh after a conflict. The separate history endpoint contains sensitive old/new LRNs and reasons; render with text properties and keep it manager-only. This is a review by the acting manager, not a second-person approval queue.

## Enrollment timeline review screens to build

Read `/api/v1/enrollments/:id/timeline` for effective history. The older `/history` route is an original-movement audit and now labels its interpretation; it must not be used alone for attendance/report calculations after corrections. Display correction history separately, using the `before_version` cursor and at most ten snapshots per page.

Managers edit the complete effective sequence, then POST its current version, entries, and correction reason to `/timeline/preview`. Show the returned before/after entries, sections/advisers, earliest affected date, and previous/proposed latest state. Confirmation sends `after_entries` as `entries`, the unchanged reason/version/hash, and `reviewed=true` to `/timeline/corrections`. These two POST routes and the placement preview/correction routes accept up to 256 KiB/1000 entries. Preserve dates as calendar strings.

Refresh and require new review after conflicts. If a response was lost, inspect history for the submitted `review_hash` and actor before attempting another change; correction commits use version conflicts rather than import-style retry receipts. Clear timeline snapshots on sign-out and render all record/reason text safely. Closed years, annual-record cancellation, and grade/year changes are not editable through this workflow.

## Learner identity review screens to build

[Section 2B.3](learner-identity.md) provides manager-only preview, confirmation, and history for duplicate links and reversal. Show both profiles and affected annual records, require a reason, display every blocking issue, and confirm only the unchanged preview with `reviewed=true`. Refresh both profile versions and rosters afterward. Inspect history on a lost response before retrying.

Enrollment `learner_id` now identifies the retained profile; `recorded_learner_id` preserves original ownership. Use the retained ID for current profile display. Linked profiles are read-only and hidden from normal lists; managers can use `include_linked=true` for reconciliation work. Clear all snapshots on sign-out. No learner or reconciliation UI was added in this release.

## Annual enrollment record review screens to build

[Section 2B.4](enrollment-records.md) adds manager-only preview, confirmation, and history for void/restoration. Show validity separately from enrolled/withdrawn status. Display both timelines and profiles for duplicate cases, the retained enrollment, all blocking issues, and an explicit reason before confirmation. Record-review snapshot enrollment IDs preserve original ownership; use its separate `learner`/`recorded_learner` objects to distinguish retained and original profiles.

Enrollment lists default to valid records. Managers can request `record_state=voided` or `all`; teachers remain restricted. Show voided timeline/history as evidence with `usable_for_reporting=false`, and disable movement/timeline edits until restored. A historical import receipt does not prove current record validity. Use current versions and unchanged review hashes; inspect history on a lost response. Clear all protected snapshots on sign-out. These screens remain unimplemented.

## Daily attendance screens to build

[Section 3B.1](daily-attendance.md) exposes dated sheets and reviewed classroom marks under `/api/v1/sections/:id/attendance`. Select `day_on` and page by `after_id` (maximum 100). Display the effective AM/PM schedule and keep null marks visibly unmarked. Teacher sheets are labeled `current_access_only` and exclude formerly accessible learners; do not present them as complete historical reports. Managers retain historical roster access. ADM, suspended, no-class and unconfigured sessions cannot receive classroom marks.

Each preview row supplies the enrollment ID and both nullable `am`/`pm` values. Preserve the other session when editing one: each row replaces the pair. Preview 1–100 learners with the sheet version and reason, show before/after values, then confirm the unchanged proposal/hash with `reviewed=true`. Omitted learners remain unchanged. Refresh on conflicts; never assume unmarked learners were present. Manager-only history can verify lost responses. Attendance dependencies can reject calendar/enrollment confirmation: explicitly review/clear affected marks, repair the underlying record, then review re-recording. These are separate transactions with preserved evidence. Clear names/reviews on sign-out and render text safely. No attendance screens or monthly totals were added in this release.

## Monthly attendance screens to build

[Section 3B.2](monthly-attendance.md) supplies `/api/v1/sections/:id/attendance/months`: manager review/members, transition preview/confirmation, immutable history and old snapshots. Teachers can use `/status` only; it deliberately excludes historical learner details and counts. Send the first-of-month `month_on` and display the clipped school-year range.

Show completeness issues, explicit unknowns, raw AM/PM session counts and complete membership before a manager submits. Never label these counts as official days or rates. Page `/members` by `after_id` (maximum 100); compare live `data_hash` values and refresh on change. Pass a historical `snapshot_id` explicitly after return/reopening when frozen evidence is intended. The outer scope is current; captured section/year metadata lives inside `review`.

Preview an allowed `submit`, `return`, `lock` or `reopen` with version and reason, then confirm the identical proposal/hash with `reviewed=true`. This is acting-manager review, not required two-person approval. Both submitted and locked months disable daily editing. Surface dependency errors on underlying record repairs; return/reopen before correcting, retain old evidence and resubmit afterward. Inspect manager history on a lost response rather than silently retrying. Finish reviews before year closure, which prevents further transitions. Clear protected snapshots on sign-out. No monthly screens were added.

## Classroom absence monitor to build

[Section 3B.3](attendance-monitor.md) adds `GET /api/v1/sections/:id/attendance/monitor` with required `from`/`to` (1–31 nonfuture dates), `view=all|with_absences|incomplete`, `limit` (50 default, 100 maximum) and `after_id`. Display filters, date-window limits, current/historical visibility, raw session counts, completion gaps and dated evidence. Show that consecutive-absence counts are limited to this window; never label them as an official school threshold or dropout determination.

Filters run before pagination. Keep nulls unknown, distinguish ADM from classroom marks and display monthly workflow status. Monitoring is live, including current display names; use the separate monthly snapshot API for historical submissions. Refresh after corrections or roster changes. Clear protected data on sign-out. This increment sends no messages and has no case-management or notification UI.

## Attendance follow-up screens to build

[Section 3B.4](attendance-followups.md) provides manager-only queues, evidence, reviewed creation/actions and history. Teachers receive no case/notes/history access. From a selected annual enrollment, preview a 1–31 date window and `absence` or `recording_gap` category; show the exact member, source versions and counts. Choose an active managerial assignee, nullable due date and reason, then confirm the unchanged hash with `reviewed=true`. There is no automatic-alert rule or messaging action.

Show immutable opening evidence beside current evidence, including `evidence_changed` and unavailable membership after corrections. The queue is live and supports year, status, original section, owner, overdue and UUID pagination filters. Read details and history separately; the list omits evidence/reasons. Case notes use the `update` action even when owner/date stay the same. Resolve/cancel with a null due date; reopen only when no newer case is open. Each action requires current-version review and explicit confirmation. Existing cases remain manageable after year closure. Inspect history after a lost response, clear protected data on sign-out and render names/reasons as text. No case screens were added.

## Academic setup screens to build

[Subject catalog](subject-catalog.md) and [section offerings](section-subjects.md) are API-only. Staff can read catalog metadata; managers maintain it and read history. Show subject code, kind, grade applicability, active state and version. Grade 0 means Kindergarten, not a numeric grading policy. Catalog archival preserves existing offerings.

Managers select active, applicable subjects using the current catalog version. Display offering `subject_snapshot` as the preserved selection, separately from current catalog metadata. Refresh is explicit and draft-year only. Save the current offering version and reason; send a null subject version unless refreshing. Retired offerings remain available through the active filter. Closed years are read-only for managers and unavailable to teachers. Teachers see only their current advised open-year sections. Pagination is UUID-based; sort collected results by display order, then code/id. Inspect history after lost responses and require a new decision after conflicts. No grading controls should be inferred from these metadata endpoints.

## Assessment-policy draft screens to build

[Section 4A.3](assessment-policy-drafts.md) is manager-only and API-only. Label every record as an unapproved draft, including archived records. Allow explicit source references, Grades 1–6 applicability and 1–10 named components. Component weights use integer basis points totaling 10000 (100%); show a total and reject missing/duplicate components. No default weights, approval buttons, section binding, calculations or Kindergarten numeric forms are available.

Save all editable metadata with the current version and a reason. Canonical sorting does not represent component display priority. Archive preserves history; restore returns a record to the default draft list. Refresh on conflicts and inspect history after lost responses. Render source references and reasons as text, not executable markup; a supplied reference does not verify school approval. Teachers have no draft access.

## Assessment-policy adoption screens to build

[Section 4A.4](assessment-policy-adoptions.md) is manager-only and API-only. Present adoption as recording a school decision, never as approval of the content: show `adoption_reference` as the school's own record and keep the existing "unapproved draft" labeling on the draft itself. Display `policy_snapshot` as the frozen adopted revision and keep it visually separate from the draft's current metadata, which may already have moved on.

Adopt with the school year, the draft's current `policy_version`, an adoption date inside that year, a reference and a reason. Surface `ADOPTION_STATE` as "this draft is archived or already withdrawn", `ADOPTION_YEAR` as a closed year or out-of-range date, and `ALREADY_EXISTS` as an existing standing adoption for that school year and policy. Withdrawal is a separate reviewed action with the current adoption version and a reason; it happens once and nothing edits an adoption in place, so offer "withdraw and record a new adoption" rather than an edit form. Expect `POLICY_DRAFT_ADOPTED` when a manager tries to archive an adopted draft, and point them at the withdrawal first.

Refresh on conflicts and inspect history after a lost response instead of adopting twice. Render references and reasons as text. No approval workflow, offering binding, score entry, transmutation or computed grade exists at any endpoint, so do not build a screen that implies one.

## Assessment-policy binding screens to build

[Section 4A.5](assessment-policy-bindings.md) is manager-only and API-only. Bind from a section's offering list: show the offering, its pinned subject, and the standing adoptions available for that school year whose grade levels include the section grade. Send both current versions, `offering_version` and `adoption_version`, with a reason.

Surface `BINDING_SCOPE` as a specific mismatch rather than a generic failure — wrong school year, inapplicable grade, or a retired offering each need a different fix. `BINDING_STATE` means the adoption was withdrawn or the binding is already released, and `ALREADY_EXISTS` means that offering already has a standing binding, so release it before binding another.

Release is a separate reviewed action on the current binding version; nothing edits a binding in place, so offer "release and bind again" rather than an edit form. Expect `ADOPTION_BOUND` when withdrawing an adoption and `OFFERING_BOUND` when retiring an offering, and point the manager at the release first. Closed years are read only.

Do not present a binding as a grade setting or show any computed value beside it: no score entry, arithmetic, transmutation or grade exists at any endpoint. Teachers have no binding access in this increment.

## Score entry screens to build

[Section 4B.1](assessment-scores.md) is the first module advisers use weekly, so it deserves real design attention. From a section's offering, list assessments by reporting period and component, and offer a class sheet: learners down, one assessment across, with the maximum shown beside the title.

Component choices come from the bound adopted revision, so fetch them from the binding's adoption rather than hard-coding "WW" and "PT". An offering with no standing binding cannot hold assessments at all, so show that as "no assessment policy is bound to this subject yet" and link to the binding screen rather than presenting an empty form.

Send each learner's own `version`, using `0` for a learner with no mark yet; the batch is 1-100 and commits atomically, so surface a rejected batch as "nothing was saved" rather than implying partial success. **Never render an unrecorded mark as zero** — leave the cell visibly empty, exactly as unmarked attendance sessions are shown. Clearing a mark is sending null, not deleting a row.

Do not compute or display a total, average, percentage or grade anywhere on these screens, even client-side. No endpoint provides one, the weighting rules are not yet confirmed with the school, and a helpfully calculated column would be read as official. Surface `TASK_MAXIMUM` as "lower the recorded scores first", and expect an adviser to be unable to correct a learner who has transferred out; that is a manager action.

## Calendar screens to build

[Section 3A](instructional-calendar.md) provides calendar reads, manager preview/confirmation and all-scope history under `/api/v1/academic-years/:id/calendar`. Read explicit `from`/`to` ranges of at most 62 dates. Schoolwide reads omit `section_id`; teachers can request only their assigned sections. Display `source` and both session modes. Render unconfigured dates as unknown, never absent or automatically closed. Summary counts are session-mode counts, not attendance credits.

Use the returned `calendar_version` as mutation `version`, including `0` for an uninitialized calendar. Preview up to 62 distinct date sets/clears for one scope, show raw and effective before/after states, reason and conflicts, then submit the unchanged proposal/hash with `reviewed=true`. Clearing a section date restores inheritance. School changes with configured overrides are blocked: explicitly review/clear those overrides before changing the baseline. These are separate visible transactions. Use all-scope history and its `before_version` cursor to inspect a lost response. Refresh and re-review after conflicts; never auto-confirm a new hash. Render labels/reasons as text and clear protected review state on sign-out. Calendar UI and attendance marking UI remain unimplemented.

## Grade-placement review screens to build

[Section 2B.5](grade-placement.md) adds manager-only whole-year grade correction. Read the current effective timeline, select the verified target grade, and map every entry to a section in that grade and year. Dates, types, and reasons stay unchanged. Show old/new grades, before/after sections and advisers, and the reason before submitting the unchanged version/hash with `reviewed=true`. This is not a promotion action.

Unified timeline correction history now includes `correction_kind`, `previous_grade_level`, and `corrected_grade_level`; legacy null grades mean unknown, not Kindergarten. The placement history endpoint filters to placement revisions. Current timeline responses include grade/year; original history can reference sections from the previously recorded grade. Refresh rosters and versions after confirmation, require new review after conflicts, and inspect history on lost responses. No new frontend screens were added.
