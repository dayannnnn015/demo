import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message } from '../api';

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

export function StatusLine({ status }: { status: Status }) {
  return <p className={`status ${status.kind}`} role="status" aria-live="polite">{status.text}</p>;
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

function Control({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{field.label}</label>
      {field.options
        ? <select id={id} name={field.key} required={!field.optional} value={value} onChange={e => onChange(e.target.value)}>
            {field.options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
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
            onChange={e => onChange(e.target.value)}
          />}
      {field.hint ? <span className="hint">{field.hint}</span> : null}
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

/** The same controls as an editor, but the values only narrow the current list. */
export function Finder({ fields, initial, onApply, onClear }: {
  fields: Field[];
  initial: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onClear?: (() => void) | undefined;
}) {
  const [values, setValues] = useState(initial);
  const filled = Object.values(values).some(Boolean);
  return (
    <form onSubmit={event => { event.preventDefault(); onApply(values); }}>
      <div className="form-grid">
        {fields.map(field => (
          <Control key={field.key} field={field} value={values[field.key] ?? ''} onChange={next => setValues(v => ({ ...v, [field.key]: next }))} />
        ))}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn">Search</button>
        {filled && onClear
          ? <button type="button" className="btn ghost" onClick={() => { const cleared = Object.fromEntries(fields.map(f => [f.key, ''])); setValues(cleared); onClear(); }}>Clear</button>
          : null}
      </div>
    </form>
  );
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode; numeric?: boolean };

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
  if (loading) return <div className="card-body"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" body="Records you add will appear in this list." />}</>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(column => <th key={column.header} scope="col" className={column.numeric ? 'numeric' : ''}>{column.header}</th>)}
            {detail ? <th scope="col">{actionsLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => <td key={column.header} className={column.numeric ? 'numeric' : ''}>{column.cell(row)}</td>)}
              {detail ? <td><details className="row-detail"><summary>{detailLabel}</summary><div>{detail(row)}</div></details></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{body}</p>{action ? <div className="form-actions" style={{ justifyContent: 'center' }}>{action}</div> : null}</div>;
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'attention' | 'stopped' | 'plain'; title?: string; children: ReactNode }) {
  return (
    <div className={`callout ${tone === 'plain' ? '' : tone}`}>
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
      <button type="button" className="btn ghost small" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - size))}>Previous</button>
      <span>Showing {count ? offset + 1 : 0}–{offset + count}</span>
      <button type="button" className="btn ghost small" disabled={!hasMore} onClick={() => onChange(offset + size)}>Next</button>
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
