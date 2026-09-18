import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message } from '../api';
import { Icon } from './icons';

export type Field = {
  key: string;
  label: string;
  type?: string;
  optional?: boolean;
  options?: [string, string][];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  hint?: string;
};

export type Status = { text: string; kind: 'idle' | 'busy' | 'error' | 'done' };
export const idle: Status = { text: '', kind: 'idle' };

const statusIcon = { error: 'alert', busy: 'info', done: 'check', idle: 'info' } as const;

export function StatusLine({ status }: { status: Status }) {
  return (
    <p className={`status ${status.kind}`} role="status" aria-live="polite">
      {status.kind === 'idle' ? null : <Icon name={statusIcon[status.kind]} size={16} />}
      {status.text}
    </p>
  );
}

export function Button({ label, onRun, setStatus, variant = 'secondary', size, confirm }: {
  label: string;
  onRun: () => Promise<unknown> | unknown;
  setStatus: (status: Status) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | undefined;
  confirm?: string | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const classes = ['btn', variant === 'primary' ? '' : variant, size ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} disabled={busy} onClick={async () => {
      if (confirm && !window.confirm(confirm)) return;
      setBusy(true);
      try { await onRun(); } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
      finally { if (alive.current) setBusy(false); }
    }}>{label}</button>
  );
}

/**
 * Every select in the workspace goes through here. The chevron has to be an
 * inline SVG, because the content policy allows no images at all — see the
 * .select-wrap note in app.css.
 */
export function Select({ children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className="select-wrap">
      <select {...props}>{children}</select>
      <Icon name="chevron" size={15} />
    </span>
  );
}

/**
 * `compact` is the filter-row variant: the format hint becomes the input's own
 * placeholder rather than a line beneath it, so every field in the row is the
 * same height and the labels sit on one line.
 */
function Control({ field, value, onChange, compact }: { field: Field; value: string; onChange: (value: string) => void; compact?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{field.label}</label>
      {field.options
        ? <Select id={id} name={field.key} required={!field.optional} value={value} onChange={e => onChange(e.target.value)}>
            {field.options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </Select>
        : <input
            id={id}
            name={field.key}
            required={!field.optional}
            type={field.type ?? 'text'}
            value={value}
            min={field.min}
            max={field.max}
            minLength={field.minLength}
            maxLength={field.maxLength}
            pattern={field.pattern}
            placeholder={compact ? field.hint : undefined}
            onChange={e => onChange(e.target.value)}
          />}
      {field.hint && !compact ? <span className="hint">{field.hint}</span> : null}
    </div>
  );
}

/** A versioned save form. Values stay strings until submit, where numbers coerce. */
export function Editor({ fields, initial, submitLabel = 'Save changes', onSubmit, setStatus, onSaved, note }: {
  fields: Field[];
  initial?: Record<string, unknown> | undefined;
  submitLabel?: string | undefined;
  onSubmit: (values: Record<string, unknown>) => Promise<unknown>;
  setStatus: (status: Status) => void;
  onSaved?: (() => void) | undefined;
  note?: ReactNode;
}) {
  const start = useCallback(() => Object.fromEntries(fields.map(f => {
    const raw = initial?.[f.key];
    return [f.key, raw === null || raw === undefined ? (f.options ? (f.options[0]?.[0] ?? '') : '') : String(raw)];
  })), [fields, initial]);
  const [values, setValues] = useState<Record<string, string>>(start);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValues(start()); }, [start]);
  return (
    <form onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setStatus({ text: 'Saving…', kind: 'busy' });
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        const text = values[field.key] ?? '';
        payload[field.key] = field.type === 'number' ? Number(text) : (text.trim() || null);
      }
      try {
        await onSubmit(payload);
        setStatus({ text: 'Saved.', kind: 'done' });
        onSaved?.();
      } catch (error) {
        setStatus({ text: message(error), kind: 'error' });
      } finally { setBusy(false); }
    }}>
      <div className="form-grid">
        {fields.map(field => (
          <Control key={field.key} field={field} value={values[field.key] ?? ''} onChange={next => setValues(v => ({ ...v, [field.key]: next }))} />
        ))}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {note}
      </div>
    </form>
  );
}

/** The same controls as an editor, but laid out as one filter row above a list. */
export function Finder({ fields, initial, onApply, onClear }: {
  fields: Field[];
  initial: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onClear?: (() => void) | undefined;
}) {
  const [values, setValues] = useState(initial);
  const filled = Object.values(values).some(Boolean);
  return (
    <form className="toolbar" onSubmit={event => { event.preventDefault(); onApply(values); }}>
      <div className="form-grid">
        {fields.map(field => (
          <Control key={field.key} compact field={field} value={values[field.key] ?? ''} onChange={next => setValues(v => ({ ...v, [field.key]: next }))} />
        ))}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn"><Icon name="search" size={15} />Search</button>
        {filled && onClear
          ? <button type="button" className="btn ghost" onClick={() => { const cleared = Object.fromEntries(fields.map(f => [f.key, ''])); setValues(cleared); onClear(); }}>Clear</button>
          : null}
      </div>
    </form>
  );
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode; numeric?: boolean };

/**
 * One open row at a time, and its panel spans the full width of the table
 * rather than being squeezed into the last column. The editors these panels
 * hold are multi-field forms; a 260px cell was never enough room for one.
 */
export function Table<T>({ rows, columns, empty, detail, detailLabel = 'Edit', actionsLabel = 'Actions', rowKey, loading }: {
  rows: T[];
  columns: Column<T>[];
  empty?: ReactNode;
  detail?: ((row: T) => ReactNode) | undefined;
  detailLabel?: string | undefined;
  actionsLabel?: string | undefined;
  rowKey: (row: T) => string;
  loading?: boolean | undefined;
}) {
  const scope = useId();
  const [open, setOpen] = useState<string | null>(null);
  if (loading) return <div className="card-body"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" body="Records you add will appear in this list." />}</>;
  const span = columns.length + (detail ? 1 : 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(column => <th key={column.header} scope="col" className={column.numeric ? 'numeric' : ''}>{column.header}</th>)}
            {detail ? <th scope="col" className="actions">{actionsLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const key = rowKey(row);
            const expanded = open === key;
            const panel = `${scope}-${key}`;
            return (
              <Fragment key={key}>
                <tr>
                  {columns.map(column => <td key={column.header} className={column.numeric ? 'numeric' : ''}>{column.cell(row)}</td>)}
                  {detail ? (
                    <td className="actions">
                      <button
                        type="button"
                        className="row-toggle"
                        aria-expanded={expanded}
                        aria-controls={panel}
                        onClick={() => setOpen(expanded ? null : key)}
                      >{detailLabel}<Icon name="chevron" size={14} /></button>
                    </td>
                  ) : null}
                </tr>
                {detail && expanded ? (
                  <tr className="row-panel">
                    <td colSpan={span} id={panel}><div className="panel-inner">{detail(row)}</div></td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A record and the identifier it is filed under, stacked the way a register reads. */
export function Cell({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="cell">
      <span className="cell-title">{title}</span>
      {meta ? <span className="cell-meta">{meta}</span> : null}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{body}</p>{action ? <div className="form-actions centred">{action}</div> : null}</div>;
}

const calloutIcon = { info: 'info', attention: 'alert', stopped: 'stop' } as const;

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'attention' | 'stopped' | 'plain'; title?: string; children: ReactNode }) {
  return (
    <div className={`callout ${tone === 'plain' ? '' : tone}`}>
      {tone === 'plain' ? null : <Icon name={calloutIcon[tone]} size={16} />}
      <div>{title ? <h3>{title}</h3> : null}{children}</div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'attention' | 'stopped' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Pager({ offset, count, hasMore, onChange, size = 25 }: {
  offset: number; count: number; hasMore: boolean; onChange: (next: number) => void; size?: number;
}) {
  if (!offset && !hasMore) return null;
  return (
    <div className="pager">
      <span>Showing {count ? offset + 1 : 0}–{offset + count}</span>
      <div className="pager-nav">
        <button type="button" className="btn secondary small" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - size))}>
          <Icon name="back" size={14} />Previous
        </button>
        <button type="button" className="btn secondary small" disabled={!hasMore} onClick={() => onChange(offset + size)}>
          Next<Icon name="forward" size={14} />
        </button>
      </div>
    </div>
  );
}

export const value = (row: Record<string, unknown>, key: string) => (row[key] == null ? '' : String(row[key]));
export const sentence = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1).replaceAll('_', ' ') : '');
export const gradeName = (grade: unknown) => (Number(grade) === 0 ? 'Kindergarten' : `Grade ${Number(grade)}`);
export const yearName = (row: Record<string, unknown>) => `${row.start_year}–${Number(row.start_year) + 1}`;
export const learnerName = (row: Record<string, unknown>) =>
  [value(row, 'last_name'), [value(row, 'first_name'), value(row, 'middle_name'), value(row, 'name_extension')].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
