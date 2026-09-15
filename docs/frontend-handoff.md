# Frontend integration contract

A basic Section 1 workspace is implemented in `web/workspace.ts`, using the existing API through `web/account.ts`. `/app` and `/account/setup` share the same page. Full frontend design remains deferred until backend review. Keep calculation, permission, finalization, and record-transition rules in the backend. Read `docs/openapi.json` or `GET /openapi.json` for the current contract. Sections 1, 2A, 2B.1, 2B.2, 2B.3, 2B.4 and 2B.5 are implemented in the API; learner, import, and correction screens are not yet built.

## Authentication

Use Supabase's official client to sign in, refresh sessions, enroll/challenge/verify MFA, and recover accounts. The frontend receives only the Supabase URL and publishable key. The API receives the Supabase access token in the `Authorization` header. Do not use a service-role key, database credential, or custom JWT in the browser.

There is no public EDUNEXUS registration. A managed Auth identity must also have an active `edunexus.staff` record. On launch, call `/api/v1/me`. Treat `STAFF_ACCESS_REQUIRED` as an unapproved/suspended school account, and `MFA_REQUIRED` as a request to finish MFA. User metadata does not authorize features. Use API permissions as the final authority even if buttons are hidden.

The basic `/account/setup` page accepts invitation/recovery fragments, removes them from browser history, sets a password, and verifies MFA. It holds the session in memory and opens the workspace after `/api/v1/me` succeeds. Refreshing requires another sign-in. Sign-out clears rendered school records; an expired or suspended session returns to sign-in. The frontend still needs its own complete account-management/recovery experience. Configure exact Auth redirect allowlists and API CORS origins. Reset links must remain on trusted routes. Follow the current Supabase Auth documentation when implementing session storage for the chosen frontend framework.

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

Show draft school-year setup before activation. Allow period corrections only in draft years. Explain that closed years are immutable. [Section 2A](learner-registry.md) supports learner profiles, annual enrollment, current rosters, and movement history. Managers edit; teachers only view current assigned open-year rosters. Keep LRNs as strings, display pending for null, and never generate identifiers or silently merge matching names. Movement requests use the enrollment version and first date of the new state. [Section 2B.2](enrollment-timeline.md) supports reviewed historical corrections; classroom attendance is now available through the Section 3B.1 API, while grades, report exports, and in-app invitations remain unavailable.

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

## Calendar screens to build

[Section 3A](instructional-calendar.md) provides calendar reads, manager preview/confirmation and all-scope history under `/api/v1/academic-years/:id/calendar`. Read explicit `from`/`to` ranges of at most 62 dates. Schoolwide reads omit `section_id`; teachers can request only their assigned sections. Display `source` and both session modes. Render unconfigured dates as unknown, never absent or automatically closed. Summary counts are session-mode counts, not attendance credits.

Use the returned `calendar_version` as mutation `version`, including `0` for an uninitialized calendar. Preview up to 62 distinct date sets/clears for one scope, show raw and effective before/after states, reason and conflicts, then submit the unchanged proposal/hash with `reviewed=true`. Clearing a section date restores inheritance. School changes with configured overrides are blocked: explicitly review/clear those overrides before changing the baseline. These are separate visible transactions. Use all-scope history and its `before_version` cursor to inspect a lost response. Refresh and re-review after conflicts; never auto-confirm a new hash. Render labels/reasons as text and clear protected review state on sign-out. Calendar UI and attendance marking UI remain unimplemented.

## Grade-placement review screens to build

[Section 2B.5](grade-placement.md) adds manager-only whole-year grade correction. Read the current effective timeline, select the verified target grade, and map every entry to a section in that grade and year. Dates, types, and reasons stay unchanged. Show old/new grades, before/after sections and advisers, and the reason before submitting the unchanged version/hash with `reviewed=true`. This is not a promotion action.

Unified timeline correction history now includes `correction_kind`, `previous_grade_level`, and `corrected_grade_level`; legacy null grades mean unknown, not Kindergarten. The placement history endpoint filters to placement revisions. Current timeline responses include grade/year; original history can reference sections from the previously recorded grade. Refresh rosters and versions after confirmation, require new review after conflicts, and inspect history on lost responses. No new frontend screens were added.
