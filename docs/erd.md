# Entity relationship diagram

Generated from the live `edunexus` schema: 44 tables across 21 migrations. A single diagram at that size is unreadable, so this is an overview followed by one diagram per domain.

For a document rather than a screen, use the rendered figures in [diagrams/](diagrams/): each diagram as SVG and as a double-resolution PNG, with suggested captions.

## How to read these

Two patterns repeat throughout and explain most of the table count.

**Every record that can change has a journal beside it.** A table named `x` usually has a partner named `x_events` holding an immutable before/after snapshot of each change, with the actor, a reason, and the request ID. The journals are written in the same transaction as the change: if the journal cannot be written, the change rolls back. They are shown in the diagrams because they are half the schema, but they always hang off their parent in the same way.

**Every changeable record carries a `version`.** A write supplies the version it last read, and the database refuses the write if that no longer matches. This is what stops two staff overwriting each other silently.

Three tables are global and left out of the domain diagrams to keep them legible:

- `audit_events` — append-only change audit for every table. Records actor, request ID, table, row and the names of changed fields. Never values, learner names or credentials.
- `record_access_events` — append-only log of successful learner and enrollment reads. Records who read which record IDs, never search terms or profile values.
- `request_buckets` — persistent per-staff rate limiting.

Every `*_events` table also references `staff` as the actor. Those edges are omitted from the diagrams; assume them everywhere.

## Overview

```mermaid
flowchart TB
  F["<b>Foundation and people</b><br/>school profile, staff, invitations,<br/>school years, reporting periods, sections"]
  R["<b>Learner registry</b><br/>learners, annual enrollment,<br/>movement history, identity links"]
  C["<b>Reviewed corrections</b><br/>roster import, LRN, timeline,<br/>record void, grade placement"]
  A["<b>Calendar and attendance</b><br/>instructional days, daily marks,<br/>monthly consolidation, follow-up"]
  X["<b>Academics</b><br/>subjects, offerings, assessment<br/>policy chain, raw scores"]

  F --> R
  F --> A
  F --> X
  R --> C
  R --> A
  R --> X
  A -.->|"SF2, SF4"| O["Official forms<br/><i>not built</i>"]
  X -.->|"SF9, SF10"| O
```

Foundation defines the school year, its sections and who may act. The registry places learners into those sections. Attendance and academics both record against an annual enrollment. Corrections sit beside the registry rather than inside it, because a correction never rewrites the original record.

## Foundation and people

```mermaid
erDiagram
  AUTH_USERS ||--o| STAFF : authorizes
  STAFF ||--o{ SECTIONS : advises
  STAFF ||--o{ STAFF_INVITATIONS : requests
  STAFF_INVITATIONS ||--o| STAFF : "links once provisioned"
  STAFF_INVITATIONS ||--o{ STAFF_INVITATION_EVENTS : journals
  ACADEMIC_YEARS ||--o{ REPORTING_PERIODS : divides
  ACADEMIC_YEARS ||--o{ SECTIONS : contains

  SCHOOL_PROFILE {
    smallint id PK
    text name
    text school_code "six digits, nullable"
    integer version
  }
  STAFF {
    uuid user_id PK "auth.users"
    text display_name
    enum role "principal, administrative_officer, teacher"
    boolean active
    integer version
  }
  STAFF_INVITATIONS {
    uuid id PK
    text email "normalized lowercase"
    enum role
    text status "requested, provisioned, cancelled"
    uuid linked_user_id FK
    uuid requested_by FK
  }
  ACADEMIC_YEARS {
    uuid id PK
    integer start_year UK
    date starts_on
    date ends_on
    enum status "draft, active, closed"
  }
  REPORTING_PERIODS {
    uuid id PK
    uuid academic_year_id FK
    integer ordinal
    date starts_on
    date ends_on
  }
  SECTIONS {
    uuid id PK
    uuid academic_year_id FK
    integer grade_level "0 is Kindergarten"
    text name
    uuid adviser_user_id FK
  }
```

Sections are unique by year, grade and normalized name. An adviser must be an active teacher. A composite key of `(id, academic_year_id, grade_level)` lets later tables reference a section and inherit its year and grade, which is how cross-year mistakes are made impossible rather than merely checked.

## Learner registry and enrollment

```mermaid
erDiagram
  LEARNERS ||--o{ ENROLLMENTS : "enrolled each year"
  LEARNERS ||--o| LEARNERS : "merged into retained record"
  LEARNERS ||--o{ LEARNER_IDENTITY_EVENTS : journals
  ACADEMIC_YEARS ||--o{ ENROLLMENTS : scopes
  SECTIONS ||--o{ ENROLLMENTS : "current placement"
  ENROLLMENTS ||--o{ ENROLLMENT_EVENTS : "movement history"
  SECTIONS ||--o{ ENROLLMENT_EVENTS : "section at the time"

  LEARNERS {
    uuid id PK
    text lrn UK "12 digits, null while pending"
    text last_name
    text first_name
    text middle_name "nullable"
    date birth_date
    enum sex
    uuid merged_into FK "set when linked as duplicate"
    integer version
  }
  ENROLLMENTS {
    uuid id PK
    uuid learner_id FK
    uuid academic_year_id FK
    integer grade_level
    uuid section_id FK
    date enrolled_on
    date effective_on "start of the current state"
    enum status "enrolled, withdrawn"
    text last_reason
    text record_state "valid, voided"
    integer version
  }
  ENROLLMENT_EVENTS {
    uuid id PK
    uuid enrollment_id FK
    integer enrollment_version
    text action "regular, section_change, transfer_out, return_to_school"
    date effective_on
  }
```

One learner record persists across school years; the annual enrollment sits underneath it. A partial unique index enforces one **valid** enrollment per learner per year, so a voided record stays as evidence without occupying the slot. `effective_on` is the first day of the new state, not the last day of the old one.

## Reviewed corrections

```mermaid
erDiagram
  LEARNERS ||--o{ LRN_CORRECTIONS : "assigned LRN changed"
  ENROLLMENTS ||--o{ ENROLLMENT_CORRECTIONS : "timeline or grade repaired"
  ENROLLMENT_CORRECTIONS ||--o{ ENROLLMENT_CORRECTION_SECTIONS : "corrected entries"
  SECTIONS ||--o{ ENROLLMENT_CORRECTION_SECTIONS : "replacement section"
  ENROLLMENTS ||--o{ ENROLLMENT_RECORD_EVENTS : "voided or restored"

  IMPORT_PREVIEWS {
    uuid id PK
    uuid section_id
    text input_hash "binds the reviewed file"
    text plan_hash "binds the reviewed plan"
    text status
    timestamptz expires_at
  }
  LRN_CORRECTIONS {
    uuid id PK
    uuid learner_id FK
    text previous_lrn
    text corrected_lrn
    text reason
  }
  ENROLLMENT_CORRECTIONS {
    uuid id PK
    uuid enrollment_id FK
    integer revision
    text correction_kind "timeline, placement"
    integer previous_grade_level "nullable"
    integer corrected_grade_level "nullable"
    text review_hash
  }
  ENROLLMENT_CORRECTION_SECTIONS {
    uuid id PK
    uuid correction_id FK
    uuid section_id FK
    date effective_on
    text action
  }
```

Corrections are additive. The original `enrollment_events` rows are never rewritten; the effective timeline is the latest correction snapshot plus any ordinary movements recorded after it. Import and correction commits bind a hash of exactly what was reviewed, so a changed file or a stale preview is refused rather than silently applied.

## Calendar and attendance

```mermaid
erDiagram
  ACADEMIC_YEARS ||--o| INSTRUCTIONAL_CALENDARS : "one per year"
  INSTRUCTIONAL_CALENDARS ||--o{ INSTRUCTIONAL_DAYS : defines
  SECTIONS ||--o{ INSTRUCTIONAL_DAYS : "section override"
  INSTRUCTIONAL_CALENDARS ||--o{ CALENDAR_REVIEW_EVENTS : journals
  SECTIONS ||--o{ ATTENDANCE_DAYS : "one sheet per date"
  ATTENDANCE_DAYS ||--o{ ATTENDANCE_MARKS : holds
  ENROLLMENTS ||--o{ ATTENDANCE_MARKS : "marked learner"
  ATTENDANCE_DAYS ||--o{ ATTENDANCE_REVIEW_EVENTS : journals
  SECTIONS ||--o{ ATTENDANCE_MONTHS : consolidates
  ATTENDANCE_MONTHS ||--o{ ATTENDANCE_MONTH_SNAPSHOTS : freezes
  ATTENDANCE_MONTHS ||--o{ ATTENDANCE_MONTH_EVENTS : journals
  ENROLLMENTS ||--o{ ATTENDANCE_FOLLOWUPS : "case opened against"
  ATTENDANCE_FOLLOWUPS ||--o{ ATTENDANCE_FOLLOWUP_EVENTS : journals

  INSTRUCTIONAL_DAYS {
    uuid id PK
    uuid calendar_id FK
    uuid section_id FK "null means school-wide"
    date day_on
    text am_mode "classroom, adm, no_class, suspended"
    text pm_mode
  }
  ATTENDANCE_MARKS {
    uuid id PK
    uuid attendance_day_id FK
    uuid enrollment_id FK
    boolean am "null means not recorded"
    boolean pm "null means not recorded"
  }
  ATTENDANCE_MONTHS {
    uuid id PK
    uuid section_id FK
    date month_on "first of month"
    text status "open, submitted, returned, locked"
    uuid current_snapshot_id FK
    integer version
  }
  ATTENDANCE_FOLLOWUPS {
    uuid id PK
    uuid enrollment_id FK
    uuid section_id FK
    text category "absence, recording_gap"
    text status
    uuid owner_user_id
    date due_on "nullable"
  }
```

A date with no calendar row is **unconfigured**, not a school day, and a session with no mark is **unknown**, not present. Both are deliberate: inferring either would corrupt an SF2. Submitting a month freezes an immutable snapshot of who was enrolled and what was marked, and a deferred constraint trigger blocks any later edit that would contradict a frozen month.

## Academics

```mermaid
erDiagram
  SUBJECTS ||--o{ SUBJECT_EVENTS : journals
  SUBJECTS ||--o{ SECTION_SUBJECTS : "offered to a section"
  SECTIONS ||--o{ SECTION_SUBJECTS : takes
  SECTION_SUBJECTS ||--o{ SECTION_SUBJECT_EVENTS : journals
  ASSESSMENT_POLICY_DRAFTS ||--o{ ASSESSMENT_POLICY_DRAFT_EVENTS : journals
  ASSESSMENT_POLICY_DRAFTS ||--o{ ASSESSMENT_POLICY_ADOPTIONS : "school adopts a revision"
  ACADEMIC_YEARS ||--o{ ASSESSMENT_POLICY_ADOPTIONS : scopes
  ASSESSMENT_POLICY_ADOPTIONS ||--o{ ASSESSMENT_POLICY_ADOPTION_EVENTS : journals
  ASSESSMENT_POLICY_ADOPTIONS ||--o{ ASSESSMENT_POLICY_BINDINGS : governs
  SECTION_SUBJECTS ||--o| ASSESSMENT_POLICY_BINDINGS : "bound offering"
  ASSESSMENT_POLICY_BINDINGS ||--o{ ASSESSMENT_POLICY_BINDING_EVENTS : journals
  ASSESSMENT_POLICY_BINDINGS ||--o{ ASSESSMENT_TASKS : "component source"
  SECTION_SUBJECTS ||--o{ ASSESSMENT_TASKS : assesses
  REPORTING_PERIODS ||--o{ ASSESSMENT_TASKS : "falls within"
  ASSESSMENT_TASKS ||--o{ ASSESSMENT_SCORES : "raw marks"
  ENROLLMENTS ||--o{ ASSESSMENT_SCORES : "marked learner"
  ASSESSMENT_TASKS ||--o{ ASSESSMENT_TASK_EVENTS : journals
  ASSESSMENT_TASKS ||--o{ ASSESSMENT_SCORE_EVENTS : "batched score journal"

  SUBJECTS {
    uuid id PK
    text code UK "immutable"
    text name
    text kind "learning_area, domain"
    int_array grade_levels
    boolean active
  }
  SECTION_SUBJECTS {
    uuid id PK
    uuid section_id FK
    uuid subject_id FK
    jsonb subject_snapshot "catalog revision pinned"
    boolean active
    integer display_order
  }
  ASSESSMENT_POLICY_DRAFTS {
    uuid id PK
    text code UK
    jsonb components "codes and basis points totalling 10000"
    int_array grade_levels "1 to 6, excludes Kindergarten"
    text status "draft, archived"
  }
  ASSESSMENT_POLICY_ADOPTIONS {
    uuid id PK
    uuid academic_year_id FK
    uuid policy_id FK
    integer policy_version
    jsonb policy_snapshot "frozen revision"
    date adopted_on
    text adoption_reference "the school's own record"
    text status "adopted, withdrawn"
  }
  ASSESSMENT_TASKS {
    uuid id PK
    uuid offering_id FK
    uuid binding_id FK
    uuid reporting_period_id FK
    text component_code "from the adopted revision"
    integer sequence
    numeric max_score
  }
  ASSESSMENT_SCORES {
    uuid id PK
    uuid task_id FK
    uuid enrollment_id FK
    numeric raw_score "null means not recorded"
    integer version
  }
```

The chain runs draft → adoption → binding → task → score, and each link protects the one below it: an adopted draft cannot be archived, a bound adoption cannot be withdrawn, and a bound offering cannot be retired, until the thing depending on it is released first. An adoption freezes the whole draft revision, so revising the draft afterwards never changes what the school decided.

**Nothing in this domain computes a grade.** There is no table, column or endpoint for a total, average, percentage, MPS, GWA or transmuted mark. Those wait on the school's grading enclosure, recorded as a gate in [constraints](constraints.md).

## What is not here yet

The schema has no tables for promotion and next-year assignment (Section 5) or for released official forms and their signatories (Section 6). Both are blocked on school decisions rather than on design. When they arrive, promotion will reference `enrollments` across two school years, and released forms will hold immutable snapshots rather than regenerating from live records, for the same reason monthly attendance already does.
