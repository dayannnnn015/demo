import type { ReactNode } from 'react';
import type { Api, Row } from './api';
import type { Status } from './components/primitives';
import { School, SchoolYears, YearScoped } from './screens/Setup';
import { Activity, Invitations, Staff } from './screens/Staff';
import { Learners } from './screens/Learners';
import { Upcoming } from './screens/Upcoming';

export type ScreenProps = { api: Api; me: Row; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number };

export type Route = {
  id: string;
  nav: string;
  title: string;
  lede: string;
  /** What kind of record this screen holds, and where it ends up. Shown verbatim
   *  in the record strip, because staff navigate by form name, not by module. */
  record: string;
  feeds?: string;
  group: string;
  manager?: boolean;
  built?: boolean;
  render: (props: ScreenProps) => ReactNode;
};

const soon = (summary: string, detail: string, blocked?: string) =>
  (props: ScreenProps) => <Upcoming {...props} summary={summary} detail={detail} blocked={blocked} />;

export const routes: Route[] = [
  {
    id: 'school', nav: 'School profile', group: 'Setup', built: true,
    title: 'School profile',
    lede: 'The name, identifier and address printed on every form this system produces.',
    record: 'school_profile', feeds: 'header of SF2, SF4, SF9, SF10',
    render: p => <School {...p} />,
  },
  {
    id: 'years', nav: 'School years', group: 'Setup', built: true,
    title: 'School years',
    lede: 'Create a year as a draft, define its reporting periods, then activate it. Closing a year makes its setup read-only.',
    record: 'academic_years', feeds: 'scope of every learner and attendance record',
    render: p => <SchoolYears {...p} />,
  },
  {
    id: 'periods', nav: 'Reporting periods', group: 'Setup', built: true,
    title: 'Reporting periods',
    lede: 'The grading periods of a school year. They must sit inside the year and must not overlap.',
    record: 'reporting_periods', feeds: 'columns of SF9 and SF10',
    render: p => <YearScoped {...p} page="Reporting periods" />,
  },
  {
    id: 'sections', nav: 'Sections & advisers', group: 'Setup', built: true,
    title: 'Sections and advisers',
    lede: 'Classes for a school year, each with one adviser. An adviser sees only their own learners.',
    record: 'sections', feeds: 'class list on SF2',
    render: p => <YearScoped {...p} page="Sections" />,
  },

  {
    id: 'learners', nav: 'Learner registry', group: 'Learners', built: true,
    title: 'Learner registry',
    lede: 'One permanent record per learner, carried across school years.',
    record: 'learners', feeds: 'identity block of SF9 and SF10',
    render: p => <Learners {...p} />,
  },
  {
    id: 'enrollment', nav: 'Enrollment', group: 'Learners', manager: true,
    title: 'Enrollment and movements',
    lede: 'Enrol a learner for a school year, move them between sections, withdraw and re-enter.',
    record: 'enrollments', feeds: 'movement columns of SF2 and SF4',
    render: soon(
      'Register learners and record dated movements.',
      'The API supports annual enrolment, same-grade reassignment, withdrawal with a recorded reason, and re-entry, each keeping an immutable movement history. This screen is next to be built.',
    ),
  },
  {
    id: 'imports', nav: 'Roster import', group: 'Learners', manager: true,
    title: 'Roster import',
    lede: 'Bring in a class list from a reviewed CSV, resolving duplicates before anything is written.',
    record: 'import_previews', feeds: 'initial class roster',
    render: soon(
      'Preview a class list, resolve duplicates, then commit.',
      'The API validates up to 50 learners per file, shows every row issue and duplicate candidate, and commits only the exact file you reviewed.',
    ),
  },

  {
    id: 'calendar', nav: 'Instructional calendar', group: 'Attendance', manager: true,
    title: 'Instructional calendar',
    lede: 'Which days hold classes, and whether each session is in the classroom, alternative delivery, or no class at all.',
    record: 'instructional_days', feeds: 'school-day count on SF2',
    render: soon(
      'Set school and section schedules before attendance can be recorded.',
      'Attendance cannot be taken on a date the calendar does not describe, so this screen comes before the attendance sheet. Unconfigured dates stay unknown rather than being assumed to be school days.',
    ),
  },
  {
    id: 'attendance', nav: 'Daily attendance', group: 'Attendance',
    title: 'Daily attendance',
    lede: 'Morning and afternoon marks for one section on one date.',
    record: 'attendance_marks', feeds: 'SF2',
    render: soon(
      'Mark a class present or absent, morning and afternoon.',
      'The highest-frequency screen in the system: thirty advisers, twice a day. The API records marks in reviewed batches of up to 100 learners and keeps an unmarked session visibly unknown rather than counting it as present.',
    ),
  },
  {
    id: 'months', nav: 'Monthly consolidation', group: 'Attendance', manager: true,
    title: 'Monthly consolidation',
    lede: 'Review a section month for completeness, then submit, return, lock or reopen it.',
    record: 'attendance_months', feeds: 'SF4',
    render: soon(
      'Check a month is complete, then submit it.',
      'Submission freezes the month against later edits and keeps an immutable snapshot of who was enrolled and what was marked.',
      'Official totals and rates stay out until the school supplies its approved mark meanings and half-day rules.',
    ),
  },
  {
    id: 'followups', nav: 'Follow-up cases', group: 'Attendance', manager: true,
    title: 'Attendance follow-up',
    lede: 'Cases a manager opens against recorded absences or gaps in recording.',
    record: 'attendance_followups',
    render: soon(
      'Open, assign and resolve follow-up on absences.',
      'Cases keep the evidence they were opened from and compare it against current records, so a later correction never rewrites the history.',
      'There is no automatic alert: the school has confirmed it has no approved absence threshold.',
    ),
  },

  {
    id: 'subjects', nav: 'Subjects & offerings', group: 'Academics', manager: true,
    title: 'Subjects and section offerings',
    lede: 'The subject catalog, and which subjects each section takes this year.',
    record: 'subjects, section_subjects',
    render: soon(
      'Maintain the catalog and pick each section\'s subjects.',
      'An offering pins the exact catalog revision it was chosen from, so later edits to a subject never silently rewrite a section that already started.',
    ),
  },
  {
    id: 'policies', nav: 'Assessment policies', group: 'Academics', manager: true,
    title: 'Assessment policies',
    lede: 'Draft weighted components, record the school\'s adoption, and bind an adopted revision to a subject.',
    record: 'assessment_policy_drafts, adoptions, bindings',
    render: soon(
      'Draft, adopt and bind an assessment policy.',
      'Adoption freezes the exact revision the school decided on, so revising a draft afterwards never changes what was adopted.',
      'EDUNEXUS supplies no weights of its own. Every component and percentage here comes from the school.',
    ),
  },
  {
    id: 'scores', nav: 'Scores', group: 'Academics',
    title: 'Assessment scores',
    lede: 'Raw marks for one assessment, for the learners in your section.',
    record: 'assessment_tasks, assessment_scores', feeds: 'input to SF9',
    render: soon(
      'Record raw marks against a named assessment.',
      'Marks are stored exactly as given, with an unrecorded learner left blank rather than scored zero.',
      'No total, average, MPS, GWA or transmuted grade is computed anywhere until the school supplies its grading enclosure and sample class records.',
    ),
  },

  {
    id: 'staff', nav: 'Staff access', group: 'People', manager: true, built: true,
    title: 'Staff access',
    lede: 'Who can use EDUNEXUS, and at what permission level.',
    record: 'staff',
    render: p => <Staff {...p} />,
  },
  {
    id: 'invitations', nav: 'Invitations', group: 'People', manager: true, built: true,
    title: 'Staff invitations',
    lede: 'Request an account for a colleague, then link the identity once the operator has created it.',
    record: 'staff_invitations',
    render: p => <Invitations {...p} />,
  },
  {
    id: 'activity', nav: 'Activity log', group: 'People', manager: true, built: true,
    title: 'Activity log',
    lede: 'Every change this system has recorded. The log is append-only and cannot be edited from here.',
    record: 'audit_events',
    render: p => <Activity {...p} />,
  },
];

export const groups = ['Setup', 'Learners', 'Attendance', 'Academics', 'People'];

export const routeFor = (id: string, manager: boolean) => {
  const route = routes.find(r => r.id === id);
  if (route && (!route.manager || manager)) return route;
  return routes[0]!;
};
