import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { message } from './api';

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
  help?: string;
};

export type Status = { text: string; kind: 'idle' | 'busy' | 'error' | 'done' };
export const idle: Status = { text: '', kind: 'idle' };

/** Runs an async action, reporting progress into a status line and disabling itself. */
export function Action({ label, onRun, setStatus, className = 'inline', confirm }: {
  label: string;
  onRun: () => Promise<unknown> | unknown;
  setStatus: (status: Status) => void;
  className?: string;
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  return (
    <button type="button" className={className} disabled={busy} onClick={async () => {
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
    <label htmlFor={id}>
      {field.label}
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
      {field.help ? <small>{field.help}</small> : null}
    </label>
  );
}

/** A versioned save form. Values are strings until submit, where numbers are coerced. */
export function Editor({ title, fields, initial, submitLabel = 'Save', onSubmit, setStatus, onSaved }: {
  title?: string | undefined;
  fields: Field[];
  initial?: Record<string, unknown> | undefined;
  submitLabel?: string | undefined;
  onSubmit: (values: Record<string, unknown>) => Promise<unknown>;
  setStatus: (status: Status) => void;
  onSaved?: (() => void) | undefined;
}) {
  const start = useCallback(() => Object.fromEntries(fields.map(f => {
    const raw = initial?.[f.key];
    return [f.key, raw === null || raw === undefined ? (f.options ? (f.options[0]?.[0] ?? '') : '') : String(raw)];
  })), [fields, initial]);
  const [values, setValues] = useState<Record<string, string>>(start);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValues(start()); }, [start]);
  return (
    <form className="editor" onSubmit={async event => {
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
        setStatus({ text: 'Saved successfully.', kind: 'done' });
        onSaved?.();
      } catch (error) {
        setStatus({ text: message(error), kind: 'error' });
      } finally { setBusy(false); }
    }}>
      {title ? <h3>{title}</h3> : null}
      {fields.map(field => (
        <Control key={field.key} field={field} value={values[field.key] ?? ''} onChange={next => setValues(v => ({ ...v, [field.key]: next }))} />
      ))}
      <button type="submit" disabled={busy}>{submitLabel}</button>
    </form>
  );
}

/** Same controls as an editor, but the values only narrow the current list. */
export function Finder({ title, fields, initial, onApply }: {
  title: string;
  fields: Field[];
  initial: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <form className="editor" onSubmit={event => { event.preventDefault(); onApply(values); }}>
      <h3>{title}</h3>
      {fields.map(field => (
        <Control key={field.key} field={field} value={values[field.key] ?? ''} onChange={next => setValues(v => ({ ...v, [field.key]: next }))} />
      ))}
      <button type="submit">Search</button>
    </form>
  );
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode };

export function Table<T>({ rows, columns, empty = 'No records yet.', detail, detailLabel = 'Edit', actionsLabel = 'Actions', rowKey }: {
  rows: T[];
  columns: Column<T>[];
  empty?: string | undefined;
  detail?: ((row: T) => ReactNode) | undefined;
  detailLabel?: string | undefined;
  actionsLabel?: string | undefined;
  rowKey: (row: T) => string;
}) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(column => <th key={column.header} scope="col">{column.header}</th>)}
            {detail ? <th scope="col">{actionsLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => <td key={column.header}>{column.cell(row)}</td>)}
              {detail ? <td><details><summary>{detailLabel}</summary>{detail(row)}</details></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusLine({ status }: { status: Status }) {
  return <p className={`status ${status.kind === 'error' ? 'error' : status.kind === 'busy' ? 'busy' : ''}`} role="status" aria-live="polite">{status.text}</p>;
}

export function OffsetPager({ offset, count, hasMore, onChange, size = 25 }: {
  offset: number; count: number; hasMore: boolean; onChange: (next: number) => void; size?: number;
}) {
  return (
    <div className="actions">
      {offset > 0 ? <button type="button" className="inline" onClick={() => onChange(Math.max(0, offset - size))}>Previous</button> : null}
      <span>Showing {count ? offset + 1 : 0}–{offset + count}</span>
      {hasMore ? <button type="button" className="inline" onClick={() => onChange(offset + size)}>Next</button> : null}
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
