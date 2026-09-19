import type { ReactNode } from 'react';
import type { Api, Row } from './api';
import type { IconName } from './components/icons';
import type { Status } from './components/primitives';
import { School, SchoolYears, YearScoped } from './screens/Setup';
import { Activity, Invitations, Staff } from './screens/Staff';
import { Learners } from './screens/Learners';
import { Upcoming } from './screens/Upcoming';
import { Enrollment } from './screens/Enrollment';
import { Overview } from './screens/Overview';

export type ScreenProps = { api: Api; me: Row; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };

export type Route = {
  id: string;
  nav: string;
  icon: IconName;
  title: string;
  /** One clause. If a screen needs more than this to be understood, the screen
   *  is wrong, not the sentence. */
  lede: string;
  /** Which tables this screen writes. Not printed — it maps a screen to the
   *  table names the activity log reports, which is otherwise guesswork. */
  record: string;
  /** The DepEd form these records end up on. Staff navigate by form name, so
   *  this is the one piece of provenance the page header carries. */
  feeds?: string;
  group: string;
  /** The screen draws its own heading, so the shared page header is skipped. */
  ownHeader?: boolean;
  manager?: boolean;
  built?: boolean;
  render: (props: ScreenProps) => ReactNode;
};

const soon = (summary: string, detail: string, blocked?: string) =>
  (props: ScreenProps) => <Upcoming {...props} summary={summary} detail={detail} blocked={blocked} />;

export const routes: Route[] = [
  {
    id: 'overview', nav: 'Overview', icon: 'overview', group: 'Workspace', built: true, ownHeader: true,
    title: 'Overview',
    lede: 'Where the school year stands, and what is set up so far.',
    record: 'academic_years, sections, staff',
    render: p => <Overview {...p} />,
  },

  {
    id: 'school', nav: 'School profile', icon: 'school', group: 'Setup', built: true, ownHeader: true,
    title: 'School profile',
    lede: 'Name and address printed on every official form.',
    record: 'school_profile', feeds: 'SF2, SF4, SF9, SF10',
    render: p => <School {...p} />,
  },
  {
    id: 'years', nav: 'School years', icon: 'years', group: 'Setup', built: true, ownHeader: true,
    title: 'School years',
    lede: 'Draft, activate and close a school year.',
    record: 'academic_years',
    render: p => <SchoolYears {...p} />,
  },
  {
    id: 'periods', nav: 'Reporting periods', icon: 'periods', group: 'Setup', built: true, ownHeader: true,
    title: 'Reporting periods',
    lede: 'The grading periods a school year is divided into.',
    record: 'reporting_periods', feeds: 'SF9, SF10',
    render: p => <YearScoped {...p} page="Reporting periods" />,
  },
  {
    id: 'sections', nav: 'Sections & advisers', icon: 'sections', group: 'Setup', built: true, ownHeader: true,
    title: 'Sections and advisers',
    lede: 'Classes for a school year, each with one adviser.',
    record: 'sections', feeds: 'SF2',
    render: p => <YearScoped {...p} page="Sections" />,
  },

  {
    id: 'learners', nav: 'Learner registry', icon: 'learners', group: 'Learners', built: true, ownHeader: true,
    title: 'Learner registry',
    lede: 'One permanent record per learner, carried across years.',
    record: 'learners', feeds: 'SF9, SF10',
    render: p => <Learners {...p} />,
  },
  {
    id: 'enrollment', nav: 'Enrollment', icon: 'enrollment', group: 'Learners', manager: true, built: true, ownHeader: true,
    title: 'Enrollment and movements',
    lede: 'Enrol, move, withdraw and re-enter a learner.',
    record: 'enrollments', feeds: 'SF2, SF4',
    render: p => <Enrollment {...p} />,
  },
  {
    id: 'imports', nav: 'Roster import', icon: 'imports', group: 'Learners', manager: true,
    title: 'Roster import',
    lede: 'Bring in a class list from a reviewed CSV.',
    record: 'import_previews',
    render: soon(
      'Preview a class list, resolve duplicates, then commit.',
      'The API validates up to 50 learners per file, reports every row issue and duplicate candidate, and commits only the exact file you reviewed.',
    ),
  },

  {
    id: 'calendar', nav: 'Instructional calendar', icon: 'calendar', group: 'Attendance', manager: true,
    title: 'Instructional calendar',
    lede: 'Which days hold classes, and how each session runs.',
    record: 'instructional_days', feeds: 'SF2',
    render: soon(
      'Set school and section schedules before attendance is recorded.',
      'Attendance cannot be taken on a date the calendar does not describe, so this screen comes first. An unconfigured date stays unknown rather than being assumed to be a school day.',
    ),
  },
  {
    id: 'attendance', nav: 'Daily attendance', icon: 'attendance', group: 'Attendance',
    title: 'Daily attendance',
    lede: 'Morning and afternoon marks for one section.',
    record: 'attendance_marks', feeds: 'SF2',
    render: soon(
      'Mark a class present or absent, morning and afternoon.',
      'The highest-frequency screen in the system: thirty advisers, twice a day. The API records marks in reviewed batches of up to 100 learners and keeps an unmarked session visibly unknown rather than counting it as present.',
    ),
  },
  {
    id: 'months', nav: 'Monthly consolidation', icon: 'months', group: 'Attendance', manager: true,
    title: 'Monthly consolidation',
    lede: 'Review a section month, then submit or lock it.',
    record: 'attendance_months', feeds: 'SF4',
    render: soon(
      'Check a month is complete, then submit it.',
      'Submission freezes the month against later edits and keeps an immutable snapshot of who was enrolled and what was marked.',
      'Official totals and rates stay out until the school supplies its approved mark meanings and half-day rules.',
    ),
  },
  {
    id: 'followups', nav: 'Follow-up cases', icon: 'followups', group: 'Attendance', manager: true,
    title: 'Attendance follow-up',
    lede: 'Cases opened against absences and gaps in recording.',
    record: 'attendance_followups',
    render: soon(
      'Open, assign and resolve follow-up on absences.',
      'A case keeps the evidence it was opened from and compares it against current records, so a later correction never rewrites the history.',
      'There is no automatic alert: the school has confirmed it has no approved absence threshold.',
    ),
  },

  {
    id: 'subjects', nav: 'Subjects & offerings', icon: 'subjects', group: 'Academics', manager: true,
    title: 'Subjects and section offerings',
    lede: 'The subject catalog, and what each section takes.',
    record: 'subjects, section_subjects',
    render: soon(
      'Maintain the catalog and pick each section\'s subjects.',
      'An offering pins the exact catalog revision it was chosen from, so a later edit to a subject never silently rewrites a section that already started.',
    ),
  },
  {
    id: 'policies', nav: 'Assessment policies', icon: 'policies', group: 'Academics', manager: true,
    title: 'Assessment policies',
    lede: 'Draft, adopt and bind the school\'s assessment policy.',
    record: 'assessment_policy_drafts, adoptions, bindings',
    render: soon(
      'Draft, adopt and bind an assessment policy.',
      'Adoption freezes the exact revision the school decided on, so revising a draft afterwards never changes what was adopted.',
      'EDUNEXUS supplies no weights of its own. Every component and percentage here comes from the school.',
    ),
  },
  {
    id: 'scores', nav: 'Scores', icon: 'scores', group: 'Academics',
    title: 'Assessment scores',
    lede: 'Raw marks for one assessment, for your section.',
    record: 'assessment_tasks, assessment_scores', feeds: 'SF9',
    render: soon(
      'Record raw marks against a named assessment.',
      'Marks are stored exactly as given, and an unrecorded learner is left blank rather than scored zero.',
      'No total, average, MPS, GWA or transmuted grade is computed anywhere until the school supplies its grading enclosure and sample class records.',
    ),
  },

  {
    id: 'staff', nav: 'Staff access', icon: 'staff', group: 'People', manager: true, built: true, ownHeader: true,
    title: 'Staff access',
    lede: 'Who can use EDUNEXUS, and at what permission level.',
    record: 'staff',
    render: p => <Staff {...p} />,
  },
  {
    id: 'invitations', nav: 'Invitations', icon: 'invitations', group: 'People', manager: true, built: true, ownHeader: true,
    title: 'Staff invitations',
    lede: 'Request an account, then link it once it exists.',
    record: 'staff_invitations',
    render: p => <Invitations {...p} />,
  },
  {
    id: 'activity', nav: 'Activity log', icon: 'activity', group: 'People', manager: true, built: true,
    title: 'Activity log',
    lede: 'Every change this system has recorded. Append-only.',
    record: 'audit_events',
    render: p => <Activity {...p} />,
  },
];

export const groups = ['Workspace', 'Setup', 'Learners', 'Attendance', 'Academics', 'People'];

export const routeFor = (id: string, manager: boolean) => {
  const route = routes.find(r => r.id === id);
  if (route && (!route.manager || manager)) return route;
  return routes[0]!;
};
