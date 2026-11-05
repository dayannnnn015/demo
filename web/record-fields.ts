import type { Field } from './components/primitives';

/** A learner's details as every form prints them; the registry and the SF10 edit them alike. */
export const profileFields: Field[] = [
  { key: 'last_name', label: 'Last name', maxLength: 100 },
  { key: 'first_name', label: 'First name', maxLength: 100 },
  { key: 'middle_name', label: 'Middle name', optional: true, maxLength: 100 },
  { key: 'name_extension', label: 'Extension', optional: true, maxLength: 20, hint: 'Jr, III, and so on.' },
  { key: 'birth_date', label: 'Birth date', type: 'date' },
  { key: 'sex', label: 'Sex as recorded on school forms', options: [['female', 'Female'], ['male', 'Male']], choose: true },
  // One line, which is the whole of what migration 0053 opened of the
  // learner-fields gate. Optional, because an address nobody has written down
  // is unrecorded rather than blank, and requiring it would block registering a
  // learner the school is enrolling today.
  { key: 'address', label: 'Address', optional: true, maxLength: 300, wide: true, hint: 'One line, as the school’s own learner information writes it.' },
];

/** The school's heading and signature details, as every form prints them; School profile and the forms edit them alike. */
export const schoolFields: Field[] = [
  { key: 'name', label: 'School name', maxLength: 150 },
  { key: 'school_code', label: 'School ID', optional: true, pattern: '[0-9]{6}', maxLength: 6, hint: 'Six digits. Leave blank until the school confirms it.' },
  { key: 'address', label: 'Address', maxLength: 300, wide: true },
  { key: 'region', label: 'Region', optional: true, maxLength: 150, hint: 'As the forms print it, for example Cordillera Administrative Region.' },
  { key: 'division', label: 'Schools division', optional: true, maxLength: 150, hint: 'For example Schools Division Office of Benguet.' },
  { key: 'district', label: 'District', optional: true, maxLength: 150 },
  { key: 'school_head_name', label: 'School head', optional: true, maxLength: 150, hint: 'The name printed over the school head’s signature on every form.' },
  { key: 'school_head_position', label: 'School head’s position', optional: true, maxLength: 150, hint: 'For example Principal I.' },
];

/** An LRN as typed or pasted, with the spaces and dashes it is often copied with taken out; the server does the same. */
export const lrnDigits = (value: string) => value.replace(/[\s-]/g, '');
