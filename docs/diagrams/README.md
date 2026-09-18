# Diagram figures

Rendered from the Mermaid sources in [../erd.md](../erd.md), which are generated from the live `edunexus` schema. Regenerate these whenever a migration changes the schema, so a figure in the paper never disagrees with the database.

Each diagram exists twice. Use the **SVG** in anything that accepts it — it stays sharp at any size and prints cleanly. Use the **PNG** where SVG is awkward, such as some Word and Google Docs workflows; they are rendered at double resolution so they hold up in print.

The first seven are cut by implementation domain and are meant to be read as a set. The last three are cut by the school processes the manuscript names, and each is standalone: it repeats the upstream entities it needs, so one figure can carry a section of the paper on its own. They describe the same tables, not a second database.

| File | Figure | Shows |
|---|---|---|
| `general-erd` | **Entity relationship diagram** | The whole system in one figure: 19 entities holding current state, with every relationship between them |
| `00-overview` | Domain map | How the five domains depend on each other, and which feed which official form |
| `01-foundation-and-people` | Foundation and people | School profile, staff, invitations, school years, reporting periods, sections |
| `02-learner-registry-and-enrollment` | Learner registry | Learners, annual enrollment, movement history, identity links |
| `03-reviewed-corrections` | Reviewed corrections | Roster import, LRN, timeline, record void, grade placement |
| `04-calendar-and-attendance` | Calendar and attendance | Instructional days, daily marks, monthly consolidation, follow-up |
| `05-academics` | Academics | Subjects, offerings, the assessment policy chain, raw scores |
| `06-class-preparation` | **Class preparation** | Process view: the school year, its sections and advisers, and how learners are placed into classes |
| `07-attendance-record` | **Attendance record** | Process view: the instructional calendar, daily AM/PM marks, monthly consolidation and follow-up |
| `08-academic-record` | **Academic record** | Process view: subjects and offerings, the assessment policy chain, tasks and raw scores |

## Suggested captions

Wording you can lift directly, each stating what the figure is evidence of rather than repeating its title.

- **General ERD.** *Entity relationship diagram of EDUNEXUS. Attendance and assessment records attach to the annual enrollment rather than to the learner, so a child carries several years of records without any year being rewritten. Change journals, audit logs and the rate limiter are omitted for legibility.*
- **Overview.** *Domain dependencies in EDUNEXUS. Attendance and academic records both attach to an annual enrollment, and corrections sit beside the registry rather than inside it.*
- **Foundation and people.** *Foundation entities. A composite key on sections carries the school year and grade level into every record that references a section.*
- **Learner registry.** *One permanent learner record per child, with annual enrollment beneath it. A partial unique index permits one valid enrollment per learner per school year.*
- **Reviewed corrections.** *Correction entities. Original movement records are never rewritten; the effective timeline is the latest correction snapshot plus any later movements.*
- **Calendar and attendance.** *Attendance entities. An unconfigured date is not a school day and an unmarked session is not a presence; both remain unknown by design.*
- **Academics.** *The assessment chain. An adoption freezes the draft revision it was made from, so later revisions never change what the school adopted.*
- **Class preparation.** *Entities behind class preparation. A section carries its school year and grade into every record that references it, so a learner cannot be placed into a section from another year or grade.*
- **Attendance record.** *Entities behind attendance recording and consolidation. An unconfigured date is not a school day and an unmarked session is not a presence; both stay unknown rather than being inferred.*
- **Academic record.** *Entities behind academic records. Raw marks are stored against the annual enrollment, and no total, average, MPS or GWA is derived from them anywhere in the schema.*

## Regenerating

There is no npm script, because this needs a browser and runs rarely. Regenerate the Mermaid in `../erd.md` from the database first; never edit these files by hand.

The recipe, written down because the first pass was not reproducible and the figures drifted from the schema:

1. `npm install mermaid --no-save` if it is absent, and use a Playwright Chromium.
2. Extract every fenced `mermaid` block from `../erd.md`, in document order. There are ten, and they map onto the table above in that order.
3. Render each with `mermaid.render(id, code)`, where `id` is the figure's numeric prefix (`m0`…`m8`; the general ERD also uses `m0`, in its own file).
4. Initialize with `theme: 'base'` and these `themeVariables`, which are the pine and paper values from `web/styles/tokens.css` so the figures match the interface: `fontFamily: 'Source Sans 3,system-ui,sans-serif'`, `fontSize: '15px'`, `primaryColor: '#eef5f1'`, `primaryBorderColor: '#1b5643'`, `primaryTextColor: '#16231f'`, `textColor: '#16231f'`, `lineColor: '#5d6d67'`, `mainBkg: '#eef5f1'`, `background: '#f5f6f4'`, and both `attributeBackgroundColorOdd` and `attributeBackgroundColorEven` set to `#eef5f1`.
5. Write the returned `svg` string out unchanged. It keeps `width="100%"`, which is what makes it scale in a document.
6. For the PNG, put that same markup in a white container with 16px of padding, set the `svg` element's `width` and `height` from its `viewBox` and clear its `max-width`, then screenshot the container in a context with `deviceScaleFactor: 2`.

Step 6 is the part that changed. The earlier figures were screenshotted inside a fixed-width box, so a wide diagram such as `04-calendar-and-attendance` was scaled **down** from its natural 2547px to 1600px — the opposite of the double resolution this file claimed. Rendering at natural size first means every figure is genuinely 2×, at the cost of larger files.
