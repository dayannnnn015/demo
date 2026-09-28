# Capstone Figures 7-9

Verified against EDUNEXUS **0.42.0**, all **24 migrations**, on **28 September 2026**. These are the preferred paper versions of the three process ERDs. They replace the older `06-class-preparation`, `07-attendance-record` and `08-academic-record` images for manuscript use; those filenames were asset sequence numbers, not the paper's figure numbers.

| Paper figure | SVG / PNG filename |
|---|---|
| Figure 7. Entity-Relationship Diagram for Class Preparation | `figure-7-class-preparation` |
| Figure 8. Entity-Relationship Diagram for Attendance Record | `figure-8-attendance-record` |
| Figure 9. Entity-Relationship Diagram for Academic Record | `figure-9-academic-record` |

The [three-page PDF](../../../output/pdf/edunexus-figures-7-9.pdf) includes captions and explanatory notes. Each SVG is editable vector artwork. Each PNG is rendered at 600 dpi. SVG/PNG figures omit captions so Word can manage the captions and cross-references separately.

## Insert in the paper

The supplied manuscript uses portrait A4 pages and approximately **6.60 inches** of text width. Insert each SVG (preferred) or PNG **in line with text**, set its width to **6.5 inches / 16.51 cm**, and preserve its aspect ratio. Use one figure per page, with its caption beneath it. Keep image compression off or use high-fidelity image quality. Do not use a screenshot of the PDF.

The body attributes print at approximately 9 pt at this width. The new figures use dark text, light grey headers, fixed layouts and numerical cardinalities rather than tiny crow's-foot marks. They remain understandable in monochrome. The original manuscript was inspected only for page geometry; it has not been edited or copied into this repository.

## Reading the diagrams

- A number beside an entity describes how many of **that entity** may correspond to one entity at the other end: `1` exactly one, `0..1` optional one, `0..N` zero or many.
- `PK` is primary key, `FK` is foreign key or a component of a composite foreign key, `UQ` is a single-column unique key, and `?` means the column is nullable. A nullable unique LRN can be absent for multiple learners.
- A line represents an actual foreign key. Crossings are separated visually and do not join. These are ERDs, not arrows showing process order.
- These are **selected physical-schema views**. Every entity from the corresponding original process figure remains. Types, many operational attributes, additional context relationships, audit tables and most journals are omitted for legibility. They are not complete physical-schema specifications.
- A table repeated across figures is the same table. Wrapped headings use the exact SQL name broken at an underscore.

## Constraints that need words as well as lines

**Figure 7:** A section may have no adviser; its nullable adviser points to `staff.user_id`. In contrast, enrollment placement is required. The enrollment-to-section FK is `(section_id, academic_year_id, grade_level)` to `(id, academic_year_id, grade_level)`. The partial unique index allows only one **valid** enrollment per learner/year, retaining voided history. `learners.merged_into` is a nullable self-reference; its loop is omitted. `staff.user_id` also references `auth.users`, which is outside these process views. Original movement events are not the corrected effective timeline: `enrollment_corrections` and related journals participate in that resolution but are omitted here.

**Figure 8:** `instructional_calendars.id` is both the PK and the FK to the school year. A null `instructional_days.section_id` is the school baseline, not a missing learner assignment. The calendar/day relationship is an actual FK. Calendar eligibility for attendance, however, is validated by functions and triggers; there is no invented FK between instructional dates and attendance sheets. A sheet is unique by section/date; a mark by enrollment/date. Every **persisted** attendance month has a non-null snapshot reference. The initial draft can exist virtually without a month row. A snapshot may be referenced by zero or one current month row: `(section_id, month_on)` is unique on months and the snapshot FK includes those same columns. Past snapshots are retained. Section/year context FKs on snapshots and follow-ups are not all drawn. A follow-up references `(enrollment_id, academic_year_id)` and at most one case per enrollment may be open; many historical cases may exist. Nothing here establishes an approved automatic alert rule or official attendance credits.

**Figure 9:** An offering may have many binding rows over its lifetime; a partial unique index permits only one with `status='bound'`. Similarly, only one adopted policy per year/policy may stand while withdrawn rows persist. The adoption freezes its draft revision; the offering pins its subject revision. A task separately references its offering, binding and reporting period. A score is unique by task/enrollment and may be null. Section/year consistency and score visibility depend on additional constraints and writer/RLS checks that are not encoded as new lines in this figure. Components and stored policy metadata do not authorize any grade calculation.

## Reproduce and verify

From the repository root:

```text
npx tsx scripts/export-erd-schema.ts
python -m pip install reportlab svglib pymupdf
python scripts/render-paper-erds.py
```

The exporter applies migrations to a fresh disposable PGlite database with an empty mock `auth.users` table. It connects to no hosted database and loads no records or credentials. `schema-reference.json` contains column/constraint/index metadata and migration SHA-256 hashes. The renderer checks field existence, each drawn FK, parent optionality and paths through unrelated boxes, and produces the PDF with ReportLab. It also renders page previews into ignored `.local/` for visual checking. Its entity definitions and route coordinates are editable in `scripts/render-paper-erds.py`.

On a schema change, export and inspect again before rendering; cardinalities and selective scope still need human review. No database migration, API contract, runtime behavior, school policy or deployment changed for this illustration work.

See [the system and diagram review](../../system-and-erd-review-2026-09-28.md) for findings and verification boundaries.
