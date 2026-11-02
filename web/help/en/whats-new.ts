/**
 * What changed for staff, newest first, in their words rather than the
 * changelog's. Fixed text bundled with the workspace, like the rest of help;
 * an entry names only controls the screens have, which `tests/web-help.test.ts`
 * checks as it does for the guides.
 */
export type Release = { version: string; date: string; items: string[] };

export const whatsNew: Release[] = [
  {
    version: '0.86.0', date: '2026-10-29',
    items: [
      'Make the screens easier to see, read and press under *Accessibility* on {profile}: higher contrast, links always underlined, a thicker focus outline, larger buttons, more line spacing and a typeface drawn for low vision. **Put these back** undoes them all.',
    ],
  },
  {
    version: '0.85.0', date: '2026-10-29',
    items: [
      'Your browser now offers to save your password when you sign in, so you need not type it each time. You are still signed out when the tab closes, so close it on a shared computer.',
    ],
  },
  {
    version: '0.84.0', date: '2026-10-29',
    items: [
      'A year’s sections are created on {years}. A teacher’s sections are ticked on their own row on {staff}, then **Save sections**.',
    ],
  },
  {
    version: '0.81.0', date: '2026-10-28',
    items: [
      'Choose the screen EDUNEXUS opens on, a larger text size, less motion or a dark theme under *Preferences* on {profile}. They follow you to any computer you sign in on.',
      'Restart any guided tour for your role from {profile}.',
    ],
  },
  {
    version: '0.80.0', date: '2026-10-28',
    items: [
      'If your name or position is wrong on the forms, **Ask for a correction** on {profile}. The principal or the administrative officer approves it.',
      '*Your activity* on {profile} lists what you recorded and which learner records you were shown.',
    ],
  },
  {
    version: '0.79.0', date: '2026-10-28',
    items: [
      '**Turn on two-step sign-in** on {profile} so that a password someone else learns is not enough to sign in as you.',
      'See where you are signed in, and **Sign out everywhere else** if you left yourself signed in on a school computer.',
    ],
  },
  {
    version: '0.78.0', date: '2026-10-28',
    items: [
      '{profile} is new: open it from your name at the top right. Show your initials, an icon or your photo; only you, the principal and the administrative officer see it.',
    ],
  },
];
