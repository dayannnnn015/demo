type Row = Record<string, unknown>;
type Result = { items: Row[]; pagination?: { has_more?: boolean; next_before_id?: string | null } };
export type Api = <T>(path: string, method?: string, body?: Row) => Promise<T>;
type Field = { key: string; label: string; type?: string; optional?: boolean; options?: [string, string][]; min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const el = document.createElement(tag); el.textContent = text; return el;
};
const roles: [string, string][] = [['teacher', 'Teacher'], ['administrative_officer', 'Administrative officer'], ['principal', 'Principal']];
const value = (row: Row, key: string) => row[key] == null ? '' : String(row[key]);
const yearName = (row: Row) => `${row.start_year}–${Number(row.start_year) + 1}`;
const sentence = (text: string) => text ? text[0]!.toUpperCase() + text.slice(1).replaceAll('_', ' ') : '';
const gradeName = (grade: unknown) => Number(grade) === 0 ? 'Kindergarten' : `Grade ${Number(grade)}`;
// Family name first, matching how school forms list learners.
const learnerName = (row: Row) => [value(row, 'last_name'), [value(row, 'first_name'), value(row, 'middle_name'), value(row, 'name_extension')].filter(Boolean).join(' ')].filter(Boolean).join(', ');

export function mountWorkspace(root: HTMLElement, api: Api, me: Row) {
  root.replaceChildren();
  const manager = me.role !== 'teacher';
  let page = 'School';
  let offset = 0;
  let yearId = '';
  let before = '';
  let filters: Row = {};
  let generation = 0;
  let disposed = false;
  let fieldNumber = 0;
  const nav = node('nav'); nav.setAttribute('aria-label', 'Workspace');
  const status = node('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const content = node('section'); content.setAttribute('aria-label', 'Workspace content');
  root.append(nav, status, content);
  const tabs = manager ? ['School', 'School years', 'Reporting periods', 'Sections', 'Learners', 'Staff', 'Activity'] : ['School', 'School years', 'Reporting periods', 'Sections', 'Learners'];
  function button(label: string, action: () => void | Promise<void>) {
    const el = node('button', label); el.type = 'button';
    el.addEventListener('click', () => {
      el.disabled = true;
      void Promise.resolve().then(action).catch(failure).finally(() => { el.disabled = false; });
    });
    return el;
  }
  function failure(error: unknown) {
    if (disposed) return;
    status.textContent = error instanceof Error ? error.message : 'The request failed. Please try again.';
    status.className = 'error';
  }
  for (const tab of tabs) nav.append(button(tab, async () => { page = tab; offset = 0; before = ''; filters = {}; await render(); }));
  // Builds the labelled inputs shared by save forms and search forms, and
  // returns a reader for the values currently entered.
  function controls(form: HTMLFormElement, title: string, fields: Field[], initial: Row) {
    form.className = 'editor'; form.append(node('h3', title));
    const inputs: { field: Field; input: HTMLInputElement | HTMLSelectElement }[] = [];
    for (const field of fields) {
      const label = node('label', field.label);
      const input = field.options ? node('select') : node('input');
      input.name = field.key; input.required = !field.optional;
      if (input instanceof HTMLSelectElement) {
        for (const [key, title] of field.options!) { const option = node('option', title); option.value = key; input.append(option); }
      } else {
        input.type = field.type ?? 'text';
        if (field.min !== undefined) input.min = String(field.min);
        if (field.max !== undefined) input.max = String(field.max);
        if (field.minLength) input.minLength = field.minLength;
        if (field.maxLength) input.maxLength = field.maxLength;
        if (field.pattern) input.pattern = field.pattern;
      }
      if (initial[field.key] != null) input.value = String(initial[field.key]);
      input.id = `workspace-field-${++fieldNumber}`; label.htmlFor = input.id;
      form.append(label, input); inputs.push({ field, input });
    }
    return () => {
      const data: Row = {};
      for (const { field, input } of inputs) data[field.key] = field.type === 'number' ? Number(input.value) : input.value.trim() || null;
      return data;
    };
  }
  function editor(parent: HTMLElement, title: string, fields: Field[], initial: Row, save: (data: Row) => Promise<unknown>) {
    const form = node('form'); const collect = controls(form, title, fields, initial);
    const submit = node('button', 'Save'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = collect();
      const current = generation;
      submit.disabled = true;
      void save(data).then(async () => {
        if (disposed || current !== generation) return;
        await render();
        if (!status.classList.contains('error')) status.textContent = 'Saved successfully.';
      }).catch(failure).finally(() => { submit.disabled = false; });
    });
    parent.append(form);
  }
  // Same inputs as an editor, but the values only narrow the current list.
  function finder(parent: HTMLElement, title: string, fields: Field[], initial: Row, apply: (data: Row) => void) {
    const form = node('form'); const collect = controls(form, title, fields, initial);
    const submit = node('button', 'Search'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', event => { event.preventDefault(); apply(collect()); void render().catch(failure); });
    parent.append(form);
  }
  function table(parent: HTMLElement, rows: Row[], columns: [string, (row: Row) => string][], edit?: (parent: HTMLElement, row: Row) => void, extra: { labels?: [string, string]; empty?: string } = {}) {
    const labels = extra.labels ?? ['Actions', 'Edit'];
    if (!rows.length) { parent.append(node('p', extra.empty ?? 'No records yet.')); return; }
    const wrap = node('div'); wrap.className = 'table-wrap';
    const table = node('table'); const head = node('thead'); const tr = node('tr');
    for (const [title] of columns) { const th = node('th', title); th.scope = 'col'; tr.append(th); }
    if (edit) tr.append(node('th', labels[0]));
    head.append(tr); table.append(head); const body = node('tbody');
    for (const row of rows) {
      const tr = node('tr');
      for (const [, show] of columns) tr.append(node('td', show(row)));
      if (edit) {
        const td = node('td'); const details = node('details'); details.append(node('summary', labels[1])); edit(details, row); td.append(details); tr.append(td);
      }
      body.append(tr);
    }
    table.append(body); wrap.append(table); parent.append(wrap);
  }
  function pager(parent: HTMLElement, result: Result) {
    const controls = node('div'); controls.className = 'actions';
    if (offset > 0) controls.append(button('Previous', async () => { offset = Math.max(0, offset - 25); await render(); }));
    controls.append(node('span', `Showing ${result.items.length ? offset + 1 : 0}–${offset + result.items.length}`));
    if (result.pagination?.has_more) controls.append(button('Next', async () => { offset += 25; await render(); }));
    parent.append(controls);
  }
  async function all(path: string) {
    const items: Row[] = []; let skip = 0;
    while (true) {
      const result = await api<Result>(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${skip}`);
      items.push(...result.items);
      if (!result.pagination?.has_more) return items;
      skip += 100;
    }
  }
  const teachers = async () => (await all('/staff?role=teacher')).filter(row => row.active);
  async function render() {
    const current = ++generation;
    status.className = ''; status.textContent = 'Loading…'; content.replaceChildren();
    for (const item of nav.querySelectorAll('button')) item.setAttribute('aria-current', item.textContent === page ? 'page' : 'false');
    const view = node('div'); view.append(node('h2', page), button('Refresh', render));
    try {
      if (page === 'School') {
        const school = await api<Row>('/school');
        view.append(node('p', 'Start here: check the school profile, create a school year, add its reporting periods, then create sections. Learner records and attendance will follow in later sections.'));
        const fields: Field[] = [{ key: 'name', label: 'School name', maxLength: 150 }, { key: 'school_code', label: 'School ID (optional, six digits)', optional: true, pattern: '[0-9]{6}', maxLength: 6 }, { key: 'address', label: 'Address', maxLength: 300 }];
        if (manager) editor(view, 'School profile', fields, school, data => api('/school', 'PATCH', { ...data, version: school.version }));
        else table(view, [school], fields.map(f => [f.label, row => value(row, f.key)]));
      } else if (page === 'Staff') {
        const result = await api<Result>(`/staff?limit=25&offset=${offset}`);
        const allowedRoles = me.role === 'principal' ? roles : roles.slice(0, 1);
        const name: Field = { key: 'display_name', label: 'Full name', maxLength: 150 };
        view.append(node('p', 'This screen manages access for existing accounts. New staff must first be invited in Supabase Auth by the system operator; enter the returned user ID below. Sending invitations from this workspace is not yet available.'));
        table(view, result.items, [['Name', r => value(r, 'display_name')], ['Role', r => value(r, 'role').replaceAll('_', ' ')], ['Access', r => r.active ? 'Active' : 'Suspended']], (parent, row) => {
          if (me.role !== 'principal' && row.role !== 'teacher') { parent.append(node('p', 'Principal access required.')); return; }
          const fields: Field[] = [name];
          if (row.user_id !== me.user_id) fields.push({ key: 'role', label: 'Role', options: allowedRoles }, { key: 'active', label: 'Access', options: [['true', 'Active'], ['false', 'Suspended']] });
          editor(parent, 'Update staff', fields, row, data => {
            if ('active' in data) data.active = data.active === 'true';
            return api(`/staff/${row.user_id}`, 'PATCH', { ...data, version: row.version });
          });
        });
        pager(view, result);
        editor(view, 'Authorize an existing account', [{ key: 'user_id', label: 'Supabase Auth user ID', pattern: '[0-9a-fA-F-]{36}' }, name, { key: 'role', label: 'Role', options: allowedRoles }], {}, data => api('/staff', 'POST', data));
      } else if (page === 'Learners') {
        // Read-only Section 2A registry. The API decides what each staff member
        // may see, so a teacher reaching this tab simply receives fewer rows.
        const query = new URLSearchParams({ limit: '25', offset: String(offset) });
        for (const key of ['search', 'lrn', 'birth_date']) if (filters[key]) query.set(key, String(filters[key]));
        const [result, years, sections] = await Promise.all([api<Result>(`/learners?${query}`), api<Result>('/academic-years'), all('/sections')]);
        const yearLabel = (id: unknown) => { const year = years.items.find(row => row.id === id); return year ? yearName(year) : 'Unavailable school year'; };
        const sectionLabel = (id: unknown) => String(sections.find(row => row.id === id)?.name ?? 'Unavailable section');
        view.append(node('p', manager
          ? 'Search the permanent learner registry. This screen is read-only: registration, enrollment changes, corrections and roster import are still API-only.'
          : 'This list holds only the learners currently enrolled in the sections you advise in an open school year. It is read-only.'));
        finder(view, 'Find learners', [
          { key: 'search', label: 'Name or LRN (at least two characters)', optional: true, minLength: 2, maxLength: 100 },
          { key: 'lrn', label: 'Exact LRN (twelve digits)', optional: true, pattern: '[0-9]{12}', maxLength: 12 },
          { key: 'birth_date', label: 'Birth date', type: 'date', optional: true },
        ], filters, data => { filters = data; offset = 0; });
        table(view, result.items, [['Learner', learnerName], ['LRN', r => r.lrn == null ? 'Pending' : value(r, 'lrn')], ['Birth date', r => value(r, 'birth_date')], ['Sex', r => sentence(value(r, 'sex'))]], (parent, row) => {
          // Fetched on demand so opening the list does not read every learner's
          // enrollment records, each of which the API logs as an access event.
          parent.append(button('Load enrollment records', async () => {
            const enrolled = await api<Result>(`/enrollments?learner_id=${row.id}&limit=100${manager ? '&record_state=all' : ''}`);
            const panel = node('div');
            table(panel, enrolled.items, [
              ['School year', r => yearLabel(r.academic_year_id)],
              ['Grade', r => gradeName(r.grade_level)],
              ['Section', r => sectionLabel(r.section_id)],
              ['Status', r => sentence(value(r, 'status'))],
              ['Enrolled on', r => value(r, 'enrolled_on')],
              ['Latest recorded change', r => `${value(r, 'effective_on')} — ${sentence(value(r, 'last_reason'))}`],
              ['Record', r => r.record_state === 'voided' ? 'Voided — not usable for reporting' : 'Valid'],
            ], undefined, { empty: 'No school-year records for this learner.' });
            parent.replaceChildren(panel);
          }));
        }, { labels: ['Enrollment records', 'Open'], empty: 'No learners match this search.' });
        pager(view, result);
      } else if (page === 'Activity') {
        const result = await api<Result>(`/audit-events?limit=25${before ? `&before_id=${before}` : ''}`);
        view.append(node('p', 'Changes are recorded automatically. This log cannot be edited.'));
        table(view, result.items, [['Time', r => new Date(String(r.occurred_at)).toLocaleString()], ['Record', r => value(r, 'entity_table')], ['Action', r => value(r, 'operation')], ['Changed fields', r => Array.isArray(r.changed_fields) ? r.changed_fields.join(', ') : ''], ['Actor ID', r => value(r, 'actor_user_id')]]);
        if (before) view.append(button('Newest activity', async () => { before = ''; await render(); }));
        if (result.pagination?.next_before_id) view.append(button('Older activity', async () => { before = result.pagination!.next_before_id!; await render(); }));
      } else {
        const years = (await api<Result>('/academic-years')).items;
        const dates: Field[] = [{ key: 'starts_on', label: 'Start date', type: 'date' }, { key: 'ends_on', label: 'End date', type: 'date' }];
        if (page === 'School years') {
          view.append(node('p', 'Create a draft year and define its reporting periods before activating it. Closing a year locks its setup and cannot be undone here.'));
          table(view, years, [['School year', yearName], ['Start', r => value(r, 'starts_on')], ['End', r => value(r, 'ends_on')], ['Status', r => value(r, 'status')]], manager ? (parent, row) => {
            if (row.status === 'closed') { parent.append(node('p', 'Closed year is read-only.')); return; }
            const next = row.status === 'draft' ? 'active' : 'closed';
            parent.append(button(next === 'active' ? 'Activate year' : 'Close year', async () => {
              if (!window.confirm(`${next === 'active' ? 'Activate' : 'Close'} school year ${yearName(row)}?${next === 'closed' ? ' Its setup will become read-only.' : ''}`)) return;
              await api(`/academic-years/${row.id}/status`, 'PATCH', { version: row.version, status: next }); await render();
            }));
          } : undefined);
          if (manager) editor(view, 'Create school year', [{ key: 'start_year', label: 'Starting year (e.g. 2026)', type: 'number', min: 2000, max: 2199 }, ...dates], {}, data => api('/academic-years', 'POST', data));
        } else {
          if (!years.length) view.append(node('p', 'Create a school year first from the School years tab.'));
          else {
            if (!years.some(y => y.id === yearId)) yearId = String((years.find(y => y.status === 'active') ?? years[0])!.id);
            const selected = years.find(y => y.id === yearId)!;
            const label = node('label', 'School year'); const select = node('select');
            for (const year of years) { const option = node('option', `${yearName(year)} (${year.status})`); option.value = String(year.id); select.append(option); }
            select.value = yearId; select.addEventListener('change', () => { yearId = select.value; offset = 0; void render(); }); label.append(select); view.append(label);
            if (page === 'Reporting periods') {
              const result = await api<Result>(`/academic-years/${yearId}/periods`);
              const fields: Field[] = [{ key: 'ordinal', label: 'Order (1, 2, 3…)', type: 'number', min: 1, max: 12 }, { key: 'name', label: 'Period name', maxLength: 60 }, ...dates];
              view.append(node('p', 'Periods must fit within the school year and must not overlap. They can be edited while the year is a draft.'));
              table(view, result.items, [['Order', r => value(r, 'ordinal')], ['Name', r => value(r, 'name')], ['Start', r => value(r, 'starts_on')], ['End', r => value(r, 'ends_on')]], manager && selected.status === 'draft' ? (parent, row) => editor(parent, 'Update period', fields, row, data => api(`/reporting-periods/${row.id}`, 'PATCH', { ...data, version: row.version })) : undefined);
              if (manager && selected.status === 'draft') editor(view, 'Add reporting period', fields, { ordinal: result.items.length + 1 }, data => api(`/academic-years/${selected.id}/periods`, 'POST', data));
            } else {
              const [result, advisers] = await Promise.all([api<Result>(`/sections?academic_year_id=${yearId}&limit=25&offset=${offset}`), manager ? teachers() : Promise.resolve([])]);
              const fields: Field[] = [{ key: 'name', label: 'Section name', maxLength: 80 }, { key: 'adviser_user_id', label: 'Adviser', optional: true, options: [['', 'Unassigned'], ...advisers.map((r): [string, string] => [String(r.user_id), String(r.display_name)])] }];
              table(view, result.items, [['Grade', r => Number(r.grade_level) === 0 ? 'Kindergarten' : `Grade ${r.grade_level}`], ['Section', r => value(r, 'name')], ['Adviser', r => r.adviser_user_id === me.user_id ? String(me.display_name) : String(advisers.find(a => a.user_id === r.adviser_user_id)?.display_name ?? (r.adviser_user_id ? 'Unavailable staff account' : 'Unassigned'))]], manager && selected.status !== 'closed' ? (parent, row) => editor(parent, 'Update section', fields, row, data => api(`/sections/${row.id}`, 'PATCH', { ...data, version: row.version })) : undefined);
              pager(view, result);
              if (manager && selected.status !== 'closed') editor(view, 'Create section', [{ key: 'grade_level', label: 'Grade', options: Array.from({ length: 7 }, (_, grade): [string, string] => [String(grade), grade ? `Grade ${grade}` : 'Kindergarten']), type: 'number' }, ...fields], {}, data => api('/sections', 'POST', { ...data, academic_year_id: selected.id }));
            }
          }
        }
      }
      if (disposed || current !== generation) return;
      content.replaceChildren(view); status.textContent = '';
    } catch (error) { if (current === generation && !disposed) { content.replaceChildren(node('p', 'Unable to load this view.'), button('Try again', render)); failure(error); } }
  }
  void render();
  return () => { disposed = true; ++generation; root.replaceChildren(); };
}
