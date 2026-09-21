Current direction (21 September 2026): frontend work resumed after the corrective migration shipped. The whole of Section 3 now has screens — the instructional calendar, the daily attendance register, monthly consolidation and the classroom absence monitor — so the attendance workflow is walkable end to end. Attendance follow-up (3B.4) is the one module in that section still without a screen. Backend review findings are in [the review](backend-review-2026-09-20.md). **Do not enable score screens** on the current implementation or treat the score-entry gate conflict as resolved.

# Frontend integration contract

The workspace is a Vite + React + TypeScript application in `web/`, built into `public/` and served by the API at `/app`; `/app` and `/account/setup` are the same page. Keep calculation, permission, finalization, and record-transition rules in the backend. Read `docs/openapi.json` or `GET /openapi.json` for the current contract. Sections 1, 2A, 2B.1, 2B.2, 2B.3, 2B.4 and 2B.5 are implemented in the API. The workspace now also reads the Section 2A learner registry; import and correction screens are not yet built.

## How the app is put together

The workspace is organized as a route table in `web/routes.tsx`. A route carries its navigation label, its icon, title, one-line explanation, the record class it holds, the official form it feeds, its permission level and whether an interface exists yet. Adding a screen means adding a route and a component; the shell, navigation grouping and page header follow from the table, and a module with no screen yet renders an honest placeholder rather than disappearing.

Keep `lede` to one clause. It is the only sentence a screen gets, and the page header shows nothing else but the title and the form the records end up on. Everything a screen used to restate in its header — the table it writes, who is allowed to open it — is either developer detail or already answered by the navigation, so it is not printed.

`web/styles/tokens.css` holds colour, type, spacing and elevation. Use the tokens rather than literal values: the palette carries meaning, with ochre for "needs attention" and red reserved for blocked actions, so a red control in a new screen should mean something is genuinely stopped. Fonts are self-hosted in `web/fonts`; do not switch to a font CDN, because the policy is same-origin and staff addresses should not reach a third party.

The interface is drawn as a register. Every form these records end up on — SF2, SF4, SF9, SF10 — is a ruled sheet: names down the left, dated columns across, a rule under the heading and a hairline between every row. That is why the corners are square, why separation is a line rather than a shadow, and why a table's column-head rule is heavier than its row rules. Match it rather than inventing a second visual language.

The interface is a deep navy rail against white working surfaces. The rail is the only dark region on screen, because it carries navigation, which is furniture; everything that holds a record stays white on a near-white canvas, separated by hairlines rather than shadow. Navy and the blue accent are one hue at different depths, so the chart ramp, the current navigation item and the primary button read as one colour rather than four decisions.

Rail colours are a separate set of tokens — `--rail-900` through `--rail-600`, with `--rail-ink`, `--rail-dim` and `--rail-faint` for text on them — checked for contrast against the rail, not against white. `--rail-ink` and `--rail-dim` are both white: rail hierarchy is size and weight, not dimmed text. `--rail-faint` is a step down and is for icons and rules only, never for a label. Do not use `--ink-*` inside the rail or `--rail-*` outside it. The sign-in card is the one place the wordmark sits on white, and it overrides those two values explicitly.

Type is Inter throughout, with JetBrains Mono reserved for identifiers — LRNs, school IDs, audit table names, dates in a figure's axis — because a twelve-digit LRN is transcribed from paper and `0`/`O` and `1`/`l` have to be told apart. Do not set body text in the mono face, and do not introduce a third family.

Two constraints come from the content policy, which is `default-src 'none'` with a single `img-src 'self'`, added for `/favicon.svg` and for nothing else:

- **No images, and no `data:` URLs.** A CSS `background-image: url(...)` is dropped silently. This is why every `<select>` goes through the `Select` primitive, which wraps it in `.select-wrap` and draws the chevron as an inline SVG. Use `Select`, never a bare `<select>`. It is also why the EDUNEXUS mark is a redrawn SVG rather than the supplied PNG. The favicon is the one image file the origin serves, cut as `web/public/favicon.svg`; do not widen `img-src` past `'self'`, and do not reach for it to make an interface job easier.
- **No inline `style` attributes.** `style-src 'self'` covers them, so a `style={{ … }}` prop does nothing in the deployed app even though it works under `npm run dev:web`. Add a class instead. There is a `.rule` class for a divider and a `.field.inline` modifier for a control that sits in a header row.

Both are now asserted in `tests/web-shell.test.ts`, which renders the shell and every route and fails on any `style="` attribute, any `data:` URL and any `<img>`. That test exists because each of these shipped once and neither was visible in development.

**The workspace prints, and a new screen should print too.** This school runs on paper: a section list is printed and carried to a classroom, and an undated printout of learner records is exactly the artefact nobody can account for later. The `@media print` block at the foot of `app.css` drops the rail, the top bar, the filter row, the pager and every action, keeps the register, repeats `thead` across pages and avoids breaking a row. The hatch is replaced by its words there, because a diagonal rule does not survive a greyscale laser. If a screen adds furniture, add it to that block.

Icons live in `web/components/icons.tsx`, drawn inline on a 24px grid with a 1.75 stroke. They sit beside their own visible label, so they are decorative and are hidden from the accessibility tree. The collapsed rail is the one place that label is hidden, and there the button carries an `aria-label` — an icon never becomes the accessible name by itself. Add to that file rather than reaching for an icon package; the set is small on purpose.

The EDUNEXUS mark is `web/components/brand.tsx` — one component, `BrandMark`, a vector redraw of the artwork the school supplied as a PNG, which the content policy cannot load. Its three colours are literals, not tokens, because they belong to the logo and must not move when the interface palette is retuned. It carries its own navy, so it needs a light ground: `.brand-mark` is a white tile, which reads as one in the rail and disappears on the sign-in card. The original artwork and an export of the redraw are in `docs/brand/`.

Corners are square everywhere. `--r-sm`, `--r`, `--r-md` and `--r-lg` are all `0`; do not write a `border-radius` or an `rx` that bypasses them, including a `999px` pill or a rounded bar end in a figure.

`web/components/primitives.tsx` holds `Editor`, `FormSheet`, `Finder`, `Table`, `TableSkeleton`, `Task`, `Cell`, `Select`, `Badge`, `Callout`, `EmptyState`, `Unrecorded`, `Pager`, `Button`, `PrintButton`, `PageHeader`, `StatusLine` and the shared `localToday`; a `Column` may carry a `className` for a column the print stylesheet has to drop, which is how the calendar's selection boxes stay off paper; `web/dates.ts` holds plain-calendar-date arithmetic; `web/components/overlay.tsx` holds `Sheet`, `Confirm` and the `useTrap` hook they share. Prefer them over new markup so screens stay consistent, and give every table a real empty state: an empty screen is where a staff member decides whether the system is broken or simply new.

**A missing record gets the `Unrecorded` mark, never an em dash and never a blank cell.** This is the rule the system exists to hold: an unmarked attendance session and an unentered score are null, never zero and never "present". An em dash reads as a value somebody typed and an empty cell reads as a page that failed to load, so `Unrecorded` draws a ruled diagonal hatch and names what is missing: `<Unrecorded label="LRN not issued" />`. The hatch is `--hatch` in tokens.css, a CSS gradient rather than an image, and it sizes up: `.empty-mark` on an empty state, `.planned-mark` on an unbuilt screen, `.gated-box` for a figure the system may not state. Use the `shown(row, key)` helper where a value may be null.

**Creating a record opens a `Sheet`, not a second form under the list.** A screen is the register it is named after; the primary action lives in `PageHeader`'s `actions` slot and opens a focus-trapped side panel. `FormSheet` is the whole pattern for a single-form case — it carries its own `StatusLine`, because the page's line is behind the panel and a refusal announced there is a refusal nobody reads. Its `onSaved` fires only after the server accepted, so close the sheet and set the page status there. Both overlays render nothing when closed, which `tests/web-screens.test.ts` asserts: one that merely hid itself with CSS would put the text of a destructive action into the page and leave its fields in the tab order.

**Anything irreversible goes through `Confirm`, never `window.confirm`.** Pass `confirm` to `Button` and it opens one. State the consequence in the screen's own words — "Its sections, reporting periods and enrollments become read-only" — not "Are you sure?", and label the buttons with the action rather than OK.

**A rejected save marks its own fields.** `Editor` reads `ApiError.fields[]`, matches each `path` to a field key, marks that control, prints the server's message beneath it, wires `aria-invalid` and `aria-describedby`, and focuses a summary listing every problem with a control that jumps to its field. The summary uses buttons rather than `#id` anchors, because the address bar is this app's router. Editing a marked field clears its mark. Anything the server does not attribute to a field — a version conflict, a refusal, a network failure — goes to the page's `StatusLine` instead. Do not route a field rejection to the page line; that is the defect this replaced.

A `Field` may set `wide: true` to take the whole form row and `type: 'textarea'` for free text. A reason is 10–500 characters and needs both.

`Task` is the disclosure for a panel offering several things to do to one record, so the two nobody wanted are not in the way of the one they did.

`Table` opens one row at a time into a panel that spans the full width of the table, not a disclosure squeezed into the last cell. It has no column sorting, deliberately: sorting would reorder the twenty-five rows on screen and leave the other eight hundred where they are, which looks like an answer and is not one. Narrowing a list is `Finder`'s job. Its loading state is `TableSkeleton`, shaped like the table that is coming. `Cell` stacks a record over the identifier it is filed under — the name on one line, the LRN in mono beneath it — which is how a class list reads on paper and is worth more than a separate identifier column. `Finder` renders as a single filter row inside the card it filters; its fields show their format hint as a placeholder rather than a line underneath, so the row stays on one baseline.

`web/main.tsx` creates the Supabase client from `/account/config` and decides between the account flow and the workspace. `web/api.ts` wraps every call: it attaches the bearer token, unwraps the `{ data, requestId }` envelope, and throws an `ApiError` carrying the server's own `code`, so a screen can react to `VERSION_CONFLICT` or `TASK_COMPONENT` specifically rather than matching on message text. `web/components/primitives.tsx` holds the shared primitives — `Editor` for versioned saves, `Finder` for filters, `Table`, `Badge`, `Callout`, `EmptyState`, `Pager`, `Button` and `StatusLine`. Screens live in `web/screens/` and are declared in `web/routes.tsx`.

`tests/web-screens.test.ts` renders every route once against an API that returns nothing, and asserts that no column or field is labelled with a computed grade. Effects do not run in that pass, so it covers the empty and loading states rather than the data paths behind a fetch. A signed-in browser check is still the only way to exercise those.

Add a screen by writing a component that takes `{ api, me, manager, setStatus, reload, token, route }`, fetching in a `useEffect` keyed on `token` so a save refreshes it, and registering it in the route table in `web/routes.tsx`. A screen with a primary action sets `ownHeader: true` on its route and renders its own `PageHeader` with an `actions` slot; one without lets `web/App.tsx` draw the header. Run `npm run dev:web` next to `npm run dev` for hot reload; the Vite dev server proxies `/api` to port 3001.

Sessions are kept in `sessionStorage` under `edunexus-session`. A refresh keeps the user signed in; closing the tab ends the session. Do not move this to `localStorage` — these are staff tokens for a system holding sensitive learner data, and the exposure window matters more than the convenience.

Static bundle files are served before the CORS middleware, because a `type="module"` script is always fetched in CORS mode and the API origin allowlist would otherwise reject the workspace's own bundle.

## The shell

`web/components/AppShell.tsx` draws the rail, the top bar and the profile menu; `PageHeader` draws the line under the title and the form chip.

The rail groups routes by `group`, and each group heading is a button that collapses its items. Collapsing the group that holds the current page is allowed — a dot on the heading says where you are, so the rail never loses your position. The whole rail also collapses to a 76px icon strip; in that state the group headings are dropped from the markup *and* hidden in CSS, so a narrow rail is correct either way. Both preferences live in `sessionStorage` beside the session, wrapped in `try`/`catch`, because a private window throws on access and a staffroom machine should not keep one person's layout for the next.

Below 1000px the rail becomes an off-canvas drawer with a scrim, and always shows full labels there: collapsing only means something beside a full-width page.

The rail names the school from the `/school` record rather than a literal, because that is the same name printed on every official form and the School profile screen can change it. The top bar carries the page title, the active school year, the palette trigger and the profile menu, which holds sign-out.

The year is a `.scope` chip rather than an eyebrow, because it is the scope every record in the system is filed under; it turns ochre when no year is active. It is a statement, not a control — a year is activated on the School years screen, where what that means is spelled out.

`web/components/palette.tsx` is the command palette, opened with Ctrl/Cmd+K from a listener held in the shell so it works on any screen. **It searches the route table only.** That is a privacy property: every list under `/learners` and `/enrollments` writes a `record_access_events` row naming the exact records returned, so a palette that searched the registry would write one per keystroke and bury the audit it exists to serve. Its footer says so on screen, and `tests/web-shell.test.ts` asserts that sentence is still there. Both the school and the year are fetched once in `web/App.tsx` and passed down, so a screen never refetches them for its own furniture. There is deliberately **no notification bell**. Nothing in this system may raise an alert yet — the absence-alert gate blocks "any messaging on attendance" — so a badge would be decoration imitating a signal. Add one when a rule exists to fire it.

## Figures

`web/components/figures.tsx` holds `StatTile`, `Donut` and `Timeline`. They are hand-drawn inline SVG, and they have to be: a charting library that rasterises to a canvas or injects a background image has nothing to draw into under this content policy, and one that sizes bars with `style={{ width }}` is dropped outright. SVG geometry attributes — `x`, `width`, `r`, `stroke-dasharray` — are not inline styles and are unaffected, so every dimension that depends on data is one of those. Colour comes from `.slice-1` … `.slice-5`, which resolve to the chart ramp in tokens.css.

`Donut` divides a ring with `stroke-dasharray` on concentric circles rather than arc paths, so each slice is one element and a zero-count slice disappears instead of drawing a degenerate wedge. `Timeline` lays dated spans across a 1000-unit track.

None of these may be fed a mark, a score or anything derived from one. See the Overview note below.

## The Overview screen

`web/screens/Overview.tsx` is the landing screen. It reads school years, reporting periods, sections, staff, invitations and the audit log — and **reads no learner or enrollment record at all**.

That is deliberate and worth preserving. Every list under `/learners` and `/enrollments` writes a row into `record_access_events` naming the exact records returned. A dashboard that counted 897 enrolments on each load would write nine such rows per visit, each carrying a hundred learner IDs, and bury the privacy audit under its own noise. If a future tile needs a learner count, add an aggregate endpoint that returns a number without naming records; do not page the registry to count it.

Nothing on the screen is computed from a mark. The figures are calendar and roster facts — which stretch of the year today falls in, how many sections exist at each grade, who holds access. The screen ends by drawing the four figures it may not state — general average, attendance rate, academic standing, class ranking — as struck-out boxes on the unrecorded hatch, each naming what it waits on, above a heading and a paragraph saying plainly that nothing here computes a grade or a rate. A reader who expects a general average on a school dashboard should see that its absence was decided, not that a tile failed to load. Do not quietly delete those boxes to tidy the screen; deleting them is how the decision gets lost.

## Authentication

Use Supabase's official client to sign in, refresh sessions, and recover accounts. The frontend receives only the Supabase URL and publishable key. The API receives the Supabase access token in the `Authorization` header. Do not use a service-role key, database credential, or custom JWT in the browser.

Account creation is a manager action on the Invitations screen; the screen cannot yet tell whether the deployment configures an account service, so it offers the action and surfaces `IDENTITY_SERVICE_DISABLED` when it is absent. Exposing that flag on `/api/v1/me` would let the screen hide the action instead. There is no public EDUNEXUS registration. A managed Auth identity must also have an active `edunexus.staff` record. On launch, call `/api/v1/me`. Treat `STAFF_ACCESS_REQUIRED` as an unapproved/suspended school account. User metadata does not authorize features. Use API permissions as the final authority even if buttons are hidden.

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

## The daily attendance screen

[Section 3B.1](daily-attendance.md) has a screen: `web/screens/Attendance.tsx`, at `/attendance`, open to advisers and managers alike. It is the highest-frequency screen in the system — thirty advisers, twice a day — and the rules it settled are written up in [that section's own document](daily-attendance.md#the-screen).

Four are worth repeating here, because a rebuild would have to honour all four. Marks are held locally and reviewed as one batch, since the API commits atomically against a single shared sheet version. A change sends **both** sessions, because it replaces a learner's AM/PM pair rather than patching half of it — `pending()` does this and is tested for every branch, including the case where an omitted session would have cleared a mark nobody touched. Clearing a mark is one of the three choices, not a missing option, because only an explicit null clears one. And `recording_available` is false for four distinct reasons, each of which the screen names, together with the screen that resolves it.

Change history is manager-only on this screen, deliberately: a teacher's history endpoint could disclose formerly assigned learners, so it does not exist for them. A teacher's sheet is badged `current_access_only` and says in words that it is a current class list, not a historical report.

## The monthly consolidation screen

[Section 3B.2](monthly-attendance.md) has a manager screen: `web/screens/Months.tsx`, at `/months`. Teachers have none, because the `/status` read available to them carries no counts and no learner detail — there is nothing to draw.

It offers only the transitions allowed from the current state, and no edit form, because nothing edits a month in place. Every blocking issue is rendered as the sentence that says what to do next and which screen does it; `issueText` holds that mapping and a test asserts each documented code has one. Every count on the screen is a raw AM/PM classroom session and is labelled as such — not a school day, an attendance credit, a percentage or an SF4 total. Membership sits behind an explicit control because it names learner records.

## The classroom absence monitor screen

[Section 3B.3](attendance-monitor.md) has a screen: `web/screens/Monitor.tsx`, at `/monitor`, open to advisers and managers alike. It opens on the fortnight ending today, clamped to the school year.

Two rules carry the weight. The window is validated in the client before a request is spent, because the API returns one `MONITOR_RANGE` code for four different mistakes and a reader needs to know which; `windowProblem()` is a pure function with a test per branch. And a gap in the record is never drawn as an absence: `unconfigured` and `incomplete` carry the unrecorded mark, and a test asserts neither renders the word "absent".

The screen states its window beside every count, says that a run may have started before it, and closes by saying there is no approved absence rule and therefore no threshold here — pointing at the manual follow-up workflow rather than offering to open a case.

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

Do not compute or display a total, average, percentage or grade anywhere on these screens, even client-side. No endpoint provides one, the weighting rules are not yet confirmed with the school, and a helpfully calculated column would be read as official. Surface `TASK_MAXIMUM` as "lower the recorded scores first", and expect an adviser to be unable to correct a learner who has transferred out; that is a manager action. Since migration `0022` that is enforced rather than merely intended: a departed learner drops out of the adviser's sheet entirely and an entry for them answers 404, while a manager still sees both the learner and the mark. Always send the `raw_score` key — omitting it is rejected, because only an explicit null may clear a mark.

## The instructional calendar screen

[Section 3A](instructional-calendar.md) has a screen: `web/screens/Calendar.tsx`, manager-only, at `/calendar`. It reads a month, sets or clears dates through the preview-and-confirm workflow, and shows the all-scope change history. What it settled is worth keeping if it is ever rebuilt.

**A month at a time, because the SF2 is a month.** The API reads at most 62 dates, and a manager configuring a calendar is working from one page of the school's own. The month arrows are bounded by the school year, and the window is clamped to `starts_on`/`ends_on`, so a read can never fall outside the year or over the limit.

**An unconfigured date is drawn, never blank.** Both session cells carry `Unrecorded` with "Not configured". This is the whole point of the module: an unconfigured date is not a holiday, not a school day and not an absence, and attendance cannot be recorded against it. `tests/web-calendar.test.ts` asserts the mark is there and that no em dash stands in for it.

**Dates are strings, and stay strings.** `web/dates.ts` holds the month arithmetic. Nothing routes a plain calendar date through a local-time conversion: comparisons are string comparisons, which sort correctly in `YYYY-MM-DD`, and the weekday column reads UTC parts of a UTC-pinned value. At 8am in Benguet a locally parsed date is still the previous UTC day, which would put the wrong weekday beside every row.

**The classification presets are a convenience over the API's rule, not a second rule.** Choosing "Holiday" fills both sessions with "No class" because that is what the API requires of a holiday, and every session stays editable afterwards. The database still decides. If the rules in `instructional-calendar.md` change, change these with them rather than letting the form drift into being the authority.

**The review hash is never reused after a refusal.** Preview returns the hash; confirm sends back the exact proposal that was previewed. A 409 — a version conflict, a changed review, a blocking conflict — throws the hash away and returns the manager to the form. Do not retry a hash against whatever is there now.

**Conflicts are explained, not printed.** `SECTION_OVERRIDES_PRESENT` and `BASE_DAY_UNCONFIGURED` are rendered as the sentence that says what to do next, with the affected sections named. A bare code tells a school head nothing.

Two things this screen does not do. It has no field-level error mapping, because `Editor` cannot express a two-step review; a server rejection goes to the sheet's own status line, and the client enforces the length and required rules so most never reach it. And it is manager-only, so an adviser cannot yet see the schedule for their own section, which the API would allow — the daily attendance screen shows the effective schedule for the day it is marking, which is the case that matters.

## Grade-placement review screens to build


[Section 2B.5](grade-placement.md) adds manager-only whole-year grade correction. Read the current effective timeline, select the verified target grade, and map every entry to a section in that grade and year. Dates, types, and reasons stay unchanged. Show old/new grades, before/after sections and advisers, and the reason before submitting the unchanged version/hash with `reviewed=true`. This is not a promotion action.

Unified timeline correction history now includes `correction_kind`, `previous_grade_level`, and `corrected_grade_level`; legacy null grades mean unknown, not Kindergarten. The placement history endpoint filters to placement revisions. Current timeline responses include grade/year; original history can reference sections from the previously recorded grade. Refresh rosters and versions after confirmation, require new review after conflicts, and inspect history on lost responses. No new frontend screens were added.
