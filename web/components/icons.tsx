/**
 * The icon set, drawn inline rather than pulled from a package: seventeen
 * navigation glyphs and a handful of controls do not justify a dependency, and
 * an inline SVG needs no extra origin in the content-security policy.
 *
 * One visual language throughout — 24px grid, 1.75 stroke, round joins — so the
 * rail reads as one family. Icons sit beside their own visible label, so they
 * are decorative and stay out of the accessibility tree.
 */
export type IconName = keyof typeof paths;

const paths = {
  school: <><path d="M3 21h18" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  years: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /><path d="M7 14.5h4M13 14.5h4" /></>,
  periods: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  sections: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  learners: <><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="8.5" cy="10.5" r="2.5" /><path d="M4.5 16.5a4.2 4.2 0 0 1 8 0" /><path d="M15.5 9h3.5M15.5 13h3.5" /></>,
  enrollment: <><path d="M14 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  imports: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M12 3v13" /><path d="m7.5 7.5 4.5-4.5 4.5 4.5" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /><path d="m8.5 15.5 2.5 2.5 4.5-4.5" /></>,
  attendance: <><path d="M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" /><path d="m8.5 13.5 2.5 2.5 4.5-4.5" /></>,
  months: <><rect x="3" y="3" width="18" height="5" rx="1.5" /><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12.5h4" /></>,
  followups: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><path d="M4 22v-7" /></>,
  subjects: <><path d="M12 7.5v13" /><path d="M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 3.5A4 4 0 0 1 16 4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5.5a3.5 3.5 0 0 0-3.5 2.5A3.5 3.5 0 0 0 8.5 18Z" /></>,
  policies: <><path d="M12 3v18M7.5 21h9" /><path d="M4.5 6.5h15" /><path d="M7 6.5 3.5 14h7Z" /><path d="M17 6.5 13.5 14h7Z" /></>,
  scores: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  staff: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 11.5 2 2 4-4" /></>,
  invitations: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2.5 6.5 8.4 5.6a2 2 0 0 0 2.2 0l8.4-5.6" /></>,
  activity: <><path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9" /><path d="M3 4.5V9h4.5" /><path d="M12 7.5V12l3 1.8" /></>,

  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  signout: <><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="M15.5 16.5 20 12l-4.5-4.5" /><path d="M20 12H9" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.9-4.9" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  back: <><path d="m14 6-6 6 6 6" /></>,
  forward: <><path d="m10 6 6 6-6 6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.75h.01" /></>,
  alert: <><path d="M10.3 3.9 2.4 17.1A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 16.5h.01" /></>,
  stop: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
} as const;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ico"
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >{paths[name]}</svg>
  );
}
