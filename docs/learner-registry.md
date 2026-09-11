# Section 2A: learner registry and enrollment

This section adds the minimum learner profile, annual enrollment, and an immutable movement timeline. It builds on the existing staff authentication, MFA, role checks, school years, and sections. The user confirmed that principals and administrative officers make changes; teachers only read their assigned learners.

## Identity and duplicate handling

One internal learner UUID persists across school years. The profile contains first name, optional middle name, last name, optional name extension, birth date, sex as recorded for school forms, and the official LRN if available. No parent contacts, health details, religion, ethnicity, addresses, or supporting documents are collected in this increment. The school should review additional fields before import or real-data rollout.

An LRN is a 12-digit **string**, preserving leading zeroes. It is unique when supplied. `null` means the official LRN is pending; EDUNEXUS does not generate one. An assigned LRN cannot be cleared or replaced through these endpoints. A dedicated assignment endpoint fills a pending LRN once, using the current record version. DepEd identifies the LRN as a permanent identifier maintained across transfers and school levels. [DO 22, s. 2012](https://www.deped.gov.ph/2012/03/20/do-22-s-2012-adoption-of-the-unique-learner-reference-number/).

Duplicate LRNs produce HTTP 409. Name and birth-date search helps a manager inspect possible duplicate profiles; matching names do not prove the records belong to the same child. Automatic merges and corrections to an already assigned LRN are deliberately unavailable until a reviewed correction workflow exists. Basic identity fields correspond to DepEd's enrollment form, but this increment does not implement or claim completeness against the entire form. [Basic Education Enrollment Form, DM 032, s. 2024](https://www.deped.gov.ph/wp-content/uploads/DM_s2024_032.pdf).

## Annual enrollment and date semantics

- A learner has at most one enrollment per school year. The section determines its school year and grade. A learner awaiting assignment can exist in the registry without an enrollment.
- Initial enrollment must fall within the school-year dates and after the learner's birth date. Draft and active years accept enrollment; closed years do not. Future initial dates are permitted for class preparation, and assigned teachers can see these prepared rosters.
- Reassignment stays within the same school year and grade. Cross-grade promotion belongs to the later promotion section.
- Withdrawals record one of `transfer_out`, `withdrawal`, `dropout`, or `death`. These are recorded staff decisions, not classifications calculated from attendance.
- Reentry resumes the same annual enrollment; it does not create a second enrollment row. A withdrawal recorded as death cannot be reentered through the ordinary workflow.
- A movement's `effective_on` is the **first day of the new state**. The previous state applies up to the preceding day. For example, transfer-out on September 10 means the learner is no longer enrolled from September 10 onward.
- Movements must strictly follow the previous event, remain within the school year, and not be future-dated in Asia/Manila. Same-day edits, inserted backdated history, and timeline corrections require a later explicit correction workflow. This is an implementation convention for school review, not a claim about the final SF4 counting policy.
- Closing a year leaves all enrollment events available to managers and prevents further movements. It does not automatically mark learners promoted, withdrawn, or graduated.

The enrollment row is the latest recorded state. Events retain every preceding section, state transition, effective date, version, actor, and request ID. Future attendance calculations must use the timeline for the date being reported, rather than the latest row alone.

## Access and concurrency

Managers can read and edit learner profiles and enrollment records. Teachers can read profiles and enrollment rows only when the learner is currently enrolled in a section they advise in an open year. Reassignment, withdrawal, staff suspension, or year closure removes the corresponding teacher access. Previous advisers do not retain historical access by default. Movement history and read-access logs are manager-only. Both the HTTP boundary and PostgreSQL enforce these restrictions.

Every edit uses a record version. Concurrent competing updates cannot silently replace one another. Enrollment creation is protected by a unique learner/year constraint. Enrollment commands serialize with the existing staff/section advisory lock, then lock the year and learner before applying the transaction. The runtime has no direct INSERT/UPDATE/DELETE access to enrollment state or event tables; only the narrowly scoped, manager-checking database functions can write them.

Movement history and ordinary change audit commit with the state change, or all roll back together. Successful API reads record actor, request ID, resource, and returned record UUIDs. They do not copy learner names, LRNs, birth dates, search terms, or full responses into the access log. A read log records successful authorization/retrieval, not proof that a person viewed the response. Access-log review is restricted to managers, and the runtime cannot alter or delete either audit log. Database operators remain trusted administrators.

## API

All routes below use `/api/v1`, a Supabase bearer token, and deployed MFA. The complete request and response schemas are in `docs/openapi.json` and `/openapi.json`.

| Route | Purpose |
|---|---|
| `GET /learners` | Scoped search by text, exact LRN, or birth date; paginated |
| `POST /learners` | Create a minimum learner profile |
| `GET /learners/:id` | Read a visible profile |
| `PATCH /learners/:id` | Correct profile fields with the last-read version |
| `PATCH /learners/:id/lrn` | Fill a pending official LRN once |
| `GET /enrollments` | Scoped, paginated filter by year, section, learner, or status |
| `POST /enrollments` | Create an annual enrollment and initial event atomically |
| `GET /enrollments/:id` | Read the latest visible enrollment state |
| `POST /enrollments/:id/movements` | Append reassignment, withdrawal, or reentry with the current version |
| `GET /enrollments/:id/history` | Manager-only chronological, paginated movement history |
| `GET /record-access-events` | Manager-only audit, newest first with a `before_id` cursor |

Example movement body (the UUID must identify an existing section in the same year and grade):

```json
{
  "version": 1,
  "action": "reassigned",
  "effective_on": "2026-09-10",
  "section_id": "00000000-0000-4000-8000-000000000010"
}
```

On HTTP 409, fetch the current record and reconcile the intended change. Do not silently retry with the newer version. Initial POST retries are protected against a second annual enrollment, but are not a general-purpose idempotency-key workflow.

## Next increment

Section 2B will cover import validation/preview/commit, school-reviewed sample fields, duplicate reconciliation, LRN correction, and controlled enrollment timeline corrections. Class capacities and additional learner fields need school input. No CSV/XLSX import, learner-management frontend, attendance, grades, promotion, or official-form generation is included in 2A. Existing Section 1 screens continue to work.
