/**
 * Spreadsheet files built in the browser from records the screen already read.
 * Nothing is sent anywhere: the file is made here and handed to the browser to
 * save, and the reads that filled it were logged like any other.
 */
import { weekday } from './dates';
import { XWorkbook, readXlsxRows, tableWorkbook, type XStyle } from './xlsx';

/**
 * One CSV cell. Quoted when it holds a separator, and defused when it starts
 * like a spreadsheet formula: names are typed by people, and a cell beginning
 * `=` or `+` would run in Excel when someone opens the file.
 */
export const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** A file name safe on every system: letters, digits and hyphens. */
export const fileSlug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';

export function downloadCsv(name: string, text: string) {
  const link = document.createElement('a');
  // A byte-order mark, so Excel reads ñ in a learner's name as ñ.
  link.href = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

type Learner = { last_name: string; first_name: string; middle_name: string | null; name_extension: string | null; lrn?: string | null };
export type ClassRow = { status: string; enrolled_on: string; effective_on: string; learner: Learner | null };

const byName = (a: Learner | null, b: Learner | null) =>
  `${a?.last_name ?? ''} ${a?.first_name ?? ''}`.localeCompare(`${b?.last_name ?? ''} ${b?.first_name ?? ''}`);

/** The class list as a register would hold it. A missing LRN is said in words, never left blank. */
function classListTable(rows: ClassRow[]) {
  const sorted = [...rows].sort((a, b) => byName(a.learner, b.learner));
  return sorted.map((r, i) => [i + 1, r.learner?.lrn ?? 'missing', r.learner?.last_name ?? 'not readable', r.learner?.first_name ?? '', r.learner?.middle_name ?? '', r.learner?.name_extension ?? '', r.status, r.enrolled_on, r.effective_on]);
}
export function classListCsv(rows: ClassRow[]) {
  return toCsv(['no', 'lrn', 'last_name', 'first_name', 'middle_name', 'name_extension', 'status', 'enrolled_on', 'latest_change_on'], classListTable(rows));
}
/** The same list as an Excel file, the LRN and dates kept as text so Excel shows them as recorded. */
export function classListWorkbook(rows: ClassRow[], title: string) {
  return tableWorkbook({
    sheet: 'Class list', title, note: 'From EDUNEXUS. Every learner ever enrolled in the section this year, with their current status.',
    header: ['No.', 'LRN', 'Last name', 'First name', 'Middle name', 'Ext.', 'Status', 'Enrolled on', 'Latest change on'],
    rows: classListTable(rows), text: [1, 7, 8], landscape: false,
  });
}

type Mode = 'classroom' | 'alternative_delivery' | 'no_class' | 'suspended' | null;
export type RegisterDay = {
  day_on: string;
  schedule: { am: Mode; pm: Mode };
  items: (Learner & { enrollment_id: string; am: 'present' | 'absent' | null; pm: 'present' | 'absent' | null })[];
};

const cell = (mode: Mode, mark: 'present' | 'absent' | null) =>
  mode !== 'classroom' ? (mode === 'alternative_delivery' ? 'alternative delivery' : 'no class') : mark ?? 'not marked';

/**
 * A month's marks, a learner per row and a column per session. Every cell says
 * what is there: a mark, "not marked", "no class", or "not enrolled" for a date
 * the learner was not on the section's register. Nothing is counted or totalled.
 */
function registerTable(days: RegisterDay[]) {
  const learners = new Map<string, Learner>();
  for (const day of days) for (const item of day.items) if (!learners.has(item.enrollment_id)) learners.set(item.enrollment_id, item);
  const ordered = [...learners.entries()].sort((a, b) => byName(a[1], b[1]));
  return ordered.map(([id, learner]) => [
    learner.last_name, learner.first_name,
    ...days.flatMap(day => {
      const item = day.items.find(i => i.enrollment_id === id);
      return item ? [cell(day.schedule.am, item.am), cell(day.schedule.pm, item.pm)] : ['not enrolled', 'not enrolled'];
    }),
  ]);
}
export function registerCsv(days: RegisterDay[]) {
  return toCsv(['last_name', 'first_name', ...days.flatMap(d => [`${d.day_on} am`, `${d.day_on} pm`])], registerTable(days));
}
/**
 * One day's code for a learner, as the SF2 writes it: P present all day, A
 * absent all day, A/ absent in the morning, /A absent in the afternoon, and ?
 * for a session nobody marked, which is never read as present. A day with one
 * classroom session is coded by that session alone.
 */
export function dayCode(schedule: RegisterDay['schedule'], item: { am: 'present' | 'absent' | null; pm: 'present' | 'absent' | null } | undefined) {
  if (!item) return 'n.e.';
  const one = (mode: Mode, mark: 'present' | 'absent' | null) => (mode === 'alternative_delivery' ? 'AD' : mode !== 'classroom' ? null : mark === 'present' ? 'P' : mark === 'absent' ? 'A' : '?');
  const am = one(schedule.am, item.am), pm = one(schedule.pm, item.pm);
  if (am === null || pm === null) return am ?? pm ?? 'n.c.';
  if (am === pm) return am;
  if (am === 'A' && pm === 'P') return 'A/';
  if (am === 'P' && pm === 'A') return '/A';
  return `${am}/${pm}`;
}

// The SF2's own weekday letters.
const dayLetters: Record<string, string> = { Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'TH', Friday: 'F', Saturday: 'Sa', Sunday: 'Su' };

/**
 * A month's marks on one landscape page: a learner per row and a column a day
 * with the SF2's codes, the key printed under them, the names and dates printed
 * again on any further page (the group's note of 28 October: a column a session,
 * each holding a phrase, ran a month across five pages). Still nothing is
 * counted or totalled: the SF2 is the form that counts them.
 */
export function registerWorkbook(days: RegisterDay[], title: string) {
  const book = new XWorkbook();
  const sheet = book.sheet('Register');
  const learners = new Map<string, Learner>();
  for (const day of days) for (const item of day.items) if (!learners.has(item.enrollment_id)) learners.set(item.enrollment_id, item);
  const ordered = [...learners.entries()].sort((a, b) => byName(a[1], b[1]));
  const cols = 2 + days.length, border: XStyle = { border: true, size: 8 }, head: XStyle = { ...border, bold: true, align: 'center' };
  sheet.setup = { landscape: true, paper: 'a4', fitWidth: true, freeze: { rows: 4, cols: 2 }, repeat: { rows: '3:4' } };
  sheet.width(1, 4.5).width(2, 30); days.forEach((_, i) => sheet.width(3 + i, 4.6));
  sheet.merge(1, 1, 1, cols, title, { bold: true, size: 12 });
  sheet.merge(2, 1, 2, cols, 'From EDUNEXUS: the marks as recorded, one column a day of classes. Nothing here is counted or totalled; the SF2 is the form that counts them.', { italic: true, size: 8, wrap: true });
  sheet.merge(3, 1, 4, 1, 'No.', head).merge(3, 2, 4, 2, 'Learner (last name, first name)', { ...head, wrap: true });
  days.forEach((d, i) => sheet.set(3, 3 + i, Number(d.day_on.slice(8, 10)), head).set(4, 3 + i, dayLetters[weekday(d.day_on)] ?? '', { ...head, size: 7 }));
  ordered.forEach(([id, learner], r) => {
    const row = 5 + r;
    sheet.set(row, 1, r + 1, { ...border, align: 'center' }).set(row, 2, [learner.last_name, [learner.first_name, learner.middle_name, learner.name_extension].filter(Boolean).join(' ')].join(', '), { ...border, wrap: true });
    days.forEach((d, i) => {
      const code = dayCode(d.schedule, d.items.find(x => x.enrollment_id === id));
      // Not on the register that day is shaded, as the SF2 shades a date without classes; an unmarked session is not.
      sheet.set(row, 3 + i, code, { ...border, align: 'center', ...(code === 'n.e.' ? { fill: 'D9D9D9', size: 6 } : code.length > 2 ? { size: 7 } : {}) });
    });
  });
  const key = 5 + ordered.length + 1;
  sheet.merge(key, 1, key, cols, 'Key:  P = present all day   A = absent all day   A/ = absent in the morning   /A = absent in the afternoon   ? = not marked (never counted as present)   AD = alternative delivery   n.c. = no class that day   n.e. = not on this register that day (shaded)', { size: 8, italic: true, wrap: true });
  return book;
}

/** The roster import's limits, which the server enforces; the screens say so before a file is sent. */
export const MAX_BYTES = 24000;
export const MAX_ROWS = 50;

/**
 * The size of a CSV the way the API measures it: UTF-8 bytes, and data records
 * after the header with empty lines skipped. A quoted field holding a line
 * break would make this count high, which is the safe direction — the server
 * still parses the file properly and decides.
 */
export function csvStats(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim() !== '');
  return { bytes, rows: Math.max(0, lines.length - 1) };
}

/** What stops a file being sent at all, or null. */
export function csvProblem(text: string): string | null {
  if (!text.trim()) return null;
  const { bytes, rows } = csvStats(text);
  if (bytes > MAX_BYTES) return `This file is ${bytes.toLocaleString()} bytes. One import holds at most ${MAX_BYTES.toLocaleString()}; split the class into smaller files.`;
  if (rows > MAX_ROWS) return `This file has ${rows} learners. One import holds at most ${MAX_ROWS}; split it into smaller files.`;
  if (rows === 0) return 'This file has a header and no learners.';
  return null;
}

/** The roster's columns, which the API requires in this order. */
export const ROSTER_HEADER = 'lrn,first_name,middle_name,last_name,name_extension,birth_date,sex';

/**
 * The class-list template as an Excel file. The LRN and birth-date columns are
 * set to text before anyone types in them: typed into a plain cell, a twelve-digit
 * LRN shows as 1.36512E+11, and a CSV saved from it loses the LRN for good.
 */
export function rosterTemplateWorkbook() {
  return tableWorkbook({
    sheet: 'Class list', title: 'EDUNEXUS class list',
    note: 'One learner a row under the header, which stays as it is. LRN: all twelve digits, required for every learner. Birth date: YYYY-MM-DD. Sex: male or female. Save it and choose it on the import screen as it is.',
    header: ROSTER_HEADER.split(','), rows: Array.from({ length: 50 }, () => Array<null>(7).fill(null)), text: [0, 5],
  });
}

/**
 * A chosen class-list file as the CSV text the API reads. A CSV is read as it
 * is. An Excel file is read cell by cell from its header row down, so a typed
 * date becomes YYYY-MM-DD and an LRN keeps every digit; the API then checks the
 * rows exactly as it checks a CSV.
 */
export async function rosterFileText(file: File) {
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  const rows = await readXlsxRows(await file.arrayBuffer());
  const header = ROSTER_HEADER.split(',');
  const top = rows.findIndex(r => header.every((h, i) => (r[i] ?? '').toLowerCase() === h));
  if (top < 0) throw new Error(`This Excel file has no header row reading ${ROSTER_HEADER}. Start from the template, and keep its header row as it is.`);
  const learners = rows.slice(top + 1).map(r => header.map((_, i) => r[i] ?? '')).filter(r => r.some(Boolean));
  return [ROSTER_HEADER, ...learners.map(r => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
