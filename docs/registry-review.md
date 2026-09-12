# Section 2B.1: roster import and reviewed LRN corrections

Principals and administrative officers can import a class roster and correct an incorrectly recorded LRN. Teachers cannot preview/commit imports, inspect receipts, or read LRN correction history. Teacher roster boundaries still apply after import. This is a development contract for school review, using the existing minimum fields, not an arbitrary spreadsheet or official LIS importer. [Enrollment timeline corrections](enrollment-timeline.md) are implemented separately in Section 2B.2; [reviewed duplicate links](learner-identity.md) are implemented in Section 2B.3 without deleting or reparenting original records.

## CSV review

`GET /api/v1/roster-imports/template` returns instructions, limits, and this exact header:

```csv
lrn,first_name,middle_name,last_name,name_extension,birth_date,sex
```

Send the UTF-8 CSV as the `csv` string to `POST /api/v1/roster-imports/preview`, with `section_id`, `enrolled_on`, optional `entry_kind` (`regular` by default, or `transfer_in`), and optional `resolutions`. Each batch enrolls 1–50 learners in one section. CSV content is limited to 24,000 UTF-8 bytes; the entire JSON request remains limited to 32 KiB. Quoted commas, escaped quotes, CRLF/LF, and a UTF-8 BOM work. Fields must be single-line text. Empty lines are skipped; malformed data records are never skipped.

LRNs must remain strings with all 12 digits, including leading zeroes. Blank LRN means pending official assignment. Blank middle name and extension become null. Dates use `YYYY-MM-DD`; sex is `male` or `female`. Field edges are trimmed; dates and spelling are never guessed. Preserve text formatting in spreadsheet software. The parser uses bounded `csv-parse` with automatic casting disabled. [CSV sync API](https://csv.js.org/parse/api/sync/), [record-size limit](https://csv.js.org/parse/options/max_record_size/).

Previews return normalized rows, existing candidates, row issues, and the selected section. `row` counts data records starting at 1, excluding the header; issue row `0` concerns the whole batch. Validation issues return `can_commit=false` and no preview token. Malformed CSV/header or request-shape errors return HTTP 422. Preview never inserts learners or enrollments.

Duplicate handling:

- An occupied LRN blocks creation. A distinct-person explanation cannot override it.
- First name, last name, and birth date matching case-insensitively require review, even when middle names differ. This conservative check is not proof of identity and cannot detect every spelling variant.
- Select a reviewed existing learner with `{ "row": 1, "action": "use_existing", "learner_id": "<UUID>", "version": 1 }`. CSV profile fields must match exactly after trimming. Blank CSV LRN may reuse an assigned LRN; supplied LRN must match. Imports never overwrite profiles or fill pending LRNs. Correct those through the separate versioned endpoints first.
- For a namesake, use `{ "row": 1, "action": "create_distinct", "reason": "Reviewed records identify a distinct person." }`. The 10–500 character reason is retained in the committed receipt. Exclude unrelated personal details.
- A batch cannot repeat an LRN, selected learner, or first-name/last-name/birth-date combination. Import distinct namesakes in separate reviewed batches. Up to six candidates per row are disclosed; `candidates_truncated=true` means there may be more. Search the registry to resolve ambiguity. An explicitly selected learner is included among the candidates.
- Any existing annual enrollment, including withdrawn status, blocks another. Use movement/reentry on the original enrollment.

After resolving issues, request another preview. A valid preview returns a UUID and a 30-minute expiry. Show the normalized rows, candidates, chosen actions, and target section/year/date before confirmation. Keep the file and payload in browser memory; never log or commit real school CSV files.

## Commit and receipts

`POST /api/v1/roster-imports/:id/commit` takes the identical CSV, section, date, entry kind, and resolutions, plus `confirmed=true`. Only the preview's creator can commit it, with current manager/MFA authorization. CSV whitespace or line-ending changes invalidate the input fingerprint; resolution list order alone does not.

The token binds both the input and the reviewed plan, including relevant learner, section, and year versions. The API acquires the shared registry transaction lock, locks the school year, rechecks duplicates/enrollments, and rebuilds the plan before writing. All learner writes acquire the same lock before row locks; year closure cannot pass the locked year. [PostgreSQL transaction and row locks](https://www.postgresql.org/docs/current/explicit-locking.html).

Changed records require fresh review. A failure on any row rolls back all learners, enrollments, events, change-audit rows, and the receipt from that commit. There is no partial-success mode. These small batches serialize roster writes; hosted throughput and contention still require realistic load testing. Lock conflicts return HTTP 409; statement timeouts return 503.

Identical retries against a committed preview return the original receipt without repeating inserts, even after expiry. `GET /api/v1/roster-imports/:id` retrieves your preview status or receipt. Receipts contain row numbers, learner/enrollment UUIDs, actions, and distinct-person reasons, without profile copies. Another manager cannot read your preview ID; managers can still inspect school-wide records through the registry APIs.

Stable errors include `PREVIEW_CHANGED`, `PREVIEW_EXPIRED`, and `PREVIEW_LIMIT`. Pending previews are capped at ten per manager. Commit releases a slot; abandoned previews expire after 30 minutes and are deleted when another valid preview is created. A deleted token returns `NOT_FOUND`. Committed receipts remain for audit and retries. School retention/disposal policy remains to be approved.

Pending previews store only fingerprints and metadata, with no staged CSV/profile copies or filesystem uploads. Candidate/receipt access is logged by UUID, in chunks of at most 100. HTTP and ordinary change-audit logs exclude raw bodies and personal field values. The runtime cannot directly edit preview receipts or correction history; narrow functions are intended for the verified API. Database operators and the backend runtime remain trusted boundaries.

## LRN correction

`POST /api/v1/learners/:id/lrn-corrections` requires the current `version`, `previous_lrn`, `corrected_lrn`, a 10–500 character `reason`, and `reviewed=true`. The manager must verify the learner's official identifier. The database locks the learner, checks the expected version and old value, records both values with reason, actor, request ID and timestamp, then updates the profile atomically. Occupied LRNs and unchanged values fail without leaving correction history. Pending LRNs still use the initial-assignment endpoint.

The ordinary LRN update guard remains in place. Only a restricted correction intent for the next learner version, created in the same transaction, permits replacement; an invented session flag cannot bypass it. `GET /api/v1/learners/:id/lrn-corrections` returns paginated manager-only history and records access. Runtime users cannot update or delete it.

“Reviewed” means review by the acting principal or administrative officer. This is not a second-person approval queue, an official LIS update, or an identity merge. The LRN remains the permanent official identifier; the workflow corrects an incorrectly recorded EDUNEXUS value. [DepEd DO 22, s. 2012](https://www.deped.gov.ph/2012/03/20/do-22-s-2012-adoption-of-the-unique-learner-reference-number/).

## Acceptance and remaining work

Tests cover parsing/input limits, explicit duplicates, preview ownership/expiry/tampering, retries, competing requests, changed records, a 50-row batch, a later-row database rejection, closed years, LRN conflicts, and protected history/bypass attempts. Hosted results are in [deployment](deployment.md).

Section 2B.2 now adds [enrollment timeline corrections](enrollment-timeline.md). Section 2B.3 adds [reviewed identity links](learner-identity.md). Imports match linked names to the retained candidate and detect annual enrollment across linked profiles; CSV values must still match the retained profile. Historical receipts keep their original IDs. Import/correction frontend screens, overlapping annual-record resolution, and school-approved sample mappings remain. Additional fields, realistic authenticated load tests, UAT, and restore-tested backups require further work before real-data rollout.
