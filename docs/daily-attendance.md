# Section 3B.1: reviewed classroom attendance

This increment records classroom AM and PM attendance against the corrected enrollment timeline and explicit instructional calendar. It adds daily sheets, bounded preview/confirmation, preserved correction history, and protection against conflicting calendar or enrollment edits. It is API-only.

## Roles and dated rosters

Principals and administrative officers can read historical sheets and record/correct attendance. Teachers can record/correct accessible learners in sections they currently advise. The existing learner-access rule is preserved: withdrawn, voided, transferred-away and closed-year learner records remain unavailable to teachers. Teacher sheets are explicitly labeled `visibility=current_access_only`; they are not complete historical class reports. Manager sheets use `full_historical_roster`. Changing an adviser changes access immediately.

A learner belongs on a dated sheet only if their annual record is valid and their latest effective timeline entry on or before that date assigns them to the requested section without withdrawal. A movement applies from its effective date. Reentry starts eligibility again; gaps and dates before enrollment are excluded. The resolver includes reviewed timeline/grade corrections and subsequent ordinary movements. Current names and retained identity are used for sheet display; original ownership is returned as `recorded_learner_id` and recorded identities remain in review snapshots.

Sheets return minimal learner names and identifiers, not birth dates, sex or LRNs. Results are ordered by enrollment UUID, with at most 100 learners per page (default 50), and an `after_id` cursor. Pagination is not a frozen roster snapshot; reload after roster changes. There are no whole-class or official attendance totals in this increment.

## Mark semantics

Each learner has two independently nullable fields, `am` and `pm`:

| Value | Meaning |
|---|---|
| `present` | Explicitly recorded as present for that classroom session. |
| `absent` | Explicitly recorded as absent for that classroom session. |
| `null` | Unmarked or explicitly cleared; unknown, never inferred present or absent. |

Non-null marks require that session's effective calendar mode to be `classroom`. Missing dates, `no_class`, `suspended` and `alternative_delivery` sessions do not accept these marks. Alternative-delivery participation/conversion, tardiness and excused-absence classifications need a later school-reviewed policy. No half-day credits, percentages, official monthly denominators or SF2/SF4 arithmetic are computed here. The [official adoption of school forms](https://www.deped.gov.ph/2014/01/30/do-4-s-2014-adoption-of-the-modified-school-forms-sfs-for-public-elementary-and-secondary-schools-eeffective-end-of-school-year-2013-2014/) establishes SF2/SF4 purposes; obtain the school's current approved templates and examples before implementing their totals or output.

Only active academic years and dates on or before today in Asia/Manila accept writes. Managers can read draft/closed-year sheets; teachers cannot read closed-year sheets. An uninitialized sheet has version `0` and creates no persistent attendance rows. Future dates may be read for preparation but cannot receive marks. `recording_available` describes the year/date/schedule; per-learner eligibility is still revalidated at preview and commit.

## API workflow

Paths are relative to `/api/v1/sections/:id/attendance`.

| Method/path | Behavior |
|---|---|
| `GET` | Required `day_on`; optional `limit`, `after_id`. Returns schedule, context, version and accessible dated roster. |
| `POST /preview` | Required `day_on`, `version`, `changes`, `reason`. Returns proposed before/after marks, current context and a review hash. |
| `POST /corrections` | Same proposal with `review_hash` and `reviewed=true`. Returns the committed journal event. |
| `GET /corrections` | Manager-only history for required `day_on`; `limit` defaults to 5, maximum 10; use `before_version` for older events. |

Each change has exactly `enrollment_id`, `am` and `pm`. Both session fields are required: this is a replacement of that learner's AM/PM pair, not a patch of one session. Preserve the other field when editing only AM or PM. Supply 1–100 distinct enrollments in one section/date, with a single-line reason of 10–500 characters. The standard 32 KiB UTF-8 body limit applies. Omitted learners are unchanged; sending two nulls clears that learner's marks while retaining a tombstone and journal evidence.

Show proposed before/after values and schedule context before confirmation. The acting staff member must confirm the same normalized proposal and reason; this is not a second-person approval queue. Initial entry, later correction and clearing all follow this workflow. Preview makes no attendance or generic change-audit writes; successful API reads/previews do record access. All-no-op batches fail; mixed batches write only changed learners.

The version is shared across the section/date sheet, so two staff members cannot silently overwrite different parts of the same sheet using stale versions. Every committed batch advances it once. The hash also binds actor, reason, selected enrollment/profile versions, section/year context, calendar version and effective schedule. Another calendar batch conservatively invalidates a review even if it affected a different date. A commit rebuilds the review and verifies its hash; it does not trust the supplied learner IDs or earlier access.

After any 409 conflict, refresh and review again. On a lost response, managers can inspect protected history for the review hash and actor. Teachers can refresh the sheet and have a manager inspect history; they have no history endpoint that could disclose formerly assigned learners. There are no import-style replay receipts, and silently retrying with a new version is prohibited.

## Protecting existing marks

Calendar changes are rejected with `ATTENDANCE_DEPENDENCY` if any non-null mark would end up in a non-classroom session. A date's label can change while its classroom sessions remain intact. Section overrides and baseline edits use the same guard.

An enrollment update is checked against all its non-null dated marks after its effective timeline has been updated. A withdrawal/reassignment on or before an affected mark, a timeline/grade repair moving that mark to another section, or voiding the annual record is rejected. A later withdrawal that leaves earlier attendance valid is allowed. The deferred database constraint checks the final timeline and causes the complete business transaction—including correction journals and audits—to roll back on failure.

Calendar and enrollment preview endpoints can still return a review before this downstream check; confirmation may reject it with `ATTENDANCE_DEPENDENCY`. Review and clear the affected marks through the attendance workflow, perform the calendar/enrollment correction, then review any re-recording against the corrected context. These are separate transactions and must be explicit to staff. Mark history and original enrollment ownership survive the process. A cleared mark can be recorded in the corrected section without creating a second mark for the same enrollment/date.

This release has no submitted or locked months. Before adding those states, extend calendar, enrollment, identity, staff access and attendance workflows to preserve reproducible finalized results. Current identity links preserve original mark ownership and old review snapshots while current display resolves the retained profile. They do not generate a released report snapshot.

## Database and verification

Migration `0011` adds section/date version roots, marks unique by annual enrollment/date, and immutable review events. Runtime access is SELECT-only with RLS; attendance commands validate active staff, section and learner access internally. Private date/context resolvers cannot be invoked by the runtime. The existing registry advisory lock serializes roster/calendar/attendance changes before a shared year lock. External authentication calls are outside those transactions.

API access logs record only returned/reviewed enrollment IDs, split into at most 100 IDs per event. Names and reasons remain in protected business snapshots rather than generic logs. A batch, its version, journal, marks and generic audits commit or roll back together. Local and hosted tests are development verification, not a substitute for real staff MFA testing, school acceptance, monthly arithmetic validation, backup restoration or realistic concurrent API load.
