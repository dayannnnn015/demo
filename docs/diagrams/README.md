# Diagram figures

Rendered from the Mermaid sources in [../erd.md](../erd.md), which are generated from the live `edunexus` schema. Regenerate these whenever a migration changes the schema, so a figure in the paper never disagrees with the database.

Each diagram exists twice. Use the **SVG** in anything that accepts it — it stays sharp at any size and prints cleanly. Use the **PNG** where SVG is awkward, such as some Word and Google Docs workflows; they are rendered at double resolution so they hold up in print.

| File | Figure | Shows |
|---|---|---|
| `general-erd` | **Entity relationship diagram** | The whole system in one figure: 19 entities holding current state, with every relationship between them |
| `00-overview` | Domain map | How the five domains depend on each other, and which feed which official form |
| `01-foundation-and-people` | Foundation and people | School profile, staff, invitations, school years, reporting periods, sections |
| `02-learner-registry-and-enrollment` | Learner registry | Learners, annual enrollment, movement history, identity links |
| `03-reviewed-corrections` | Reviewed corrections | Roster import, LRN, timeline, record void, grade placement |
| `04-calendar-and-attendance` | Calendar and attendance | Instructional days, daily marks, monthly consolidation, follow-up |
| `05-academics` | Academics | Subjects, offerings, the assessment policy chain, raw scores |

## Suggested captions

Wording you can lift directly, each stating what the figure is evidence of rather than repeating its title.

- **General ERD.** *Entity relationship diagram of EDUNEXUS. Attendance and assessment records attach to the annual enrollment rather than to the learner, so a child carries several years of records without any year being rewritten. Change journals, audit logs and the rate limiter are omitted for legibility.*
- **Overview.** *Domain dependencies in EDUNEXUS. Attendance and academic records both attach to an annual enrollment, and corrections sit beside the registry rather than inside it.*
- **Foundation and people.** *Foundation entities. A composite key on sections carries the school year and grade level into every record that references a section.*
- **Learner registry.** *One permanent learner record per child, with annual enrollment beneath it. A partial unique index permits one valid enrollment per learner per school year.*
- **Reviewed corrections.** *Correction entities. Original movement records are never rewritten; the effective timeline is the latest correction snapshot plus any later movements.*
- **Calendar and attendance.** *Attendance entities. An unconfigured date is not a school day and an unmarked session is not a presence; both remain unknown by design.*
- **Academics.** *The assessment chain. An adoption freezes the draft revision it was made from, so later revisions never change what the school adopted.*

## Regenerating

There is no npm script, because this needs a browser and runs rarely. The sequence is: install `mermaid` without saving it, extract the fenced `mermaid` blocks from `../erd.md`, render them in a page, then write out each `svg` element and screenshot each container at double resolution. Any Mermaid renderer produces equivalent output; the theme used here sets the pine and paper colours from `web/styles/tokens.css` so the figures match the interface.

Regenerate the ERD itself from the database first, rather than editing these files by hand.
