/**
 * Drawn, not photographed. The front page shows no picture of a child: a
 * public school's site is not the place for learners' faces, and the content
 * policy serves no image file anyway. This is the La Trinidad valley at first
 * light: the Cordillera ridges, Benguet pines along the middle ridge, morning
 * mist between them, the vegetable terraces on the valley floor and the
 * schoolhouse under the flag, in the EDUNEXUS mark's navy, blue and sun.
 *
 * Every layer is its own group so the stylesheet can raise it into place on
 * the first load and part the layers as the page scrolls. Nothing moves on its
 * own after that, and nothing moves at all under reduced motion.
 */
const pines: [number, number, number][] = [
  [52, 404, 0.8], [96, 397, 1.05], [142, 389, 0.9], [196, 380, 1.15], [292, 384, 0.85], [338, 388, 1],
  [548, 362, 0.95], [596, 355, 1.2], [646, 352, 0.9], [702, 354, 1.05], [1150, 350, 0.9], [1204, 346, 1.15],
  [1262, 347, 0.95], [1318, 352, 1.1], [1376, 362, 0.85],
];

export function Valley({ still = false }: { still?: boolean }) {
  return (
    <svg className={`valley${still ? ' still' : ''}`} viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="valley-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#071b33" />
          <stop offset="0.5" stopColor="#0f3561" />
          <stop offset="0.78" stopColor="#2c5d8e" />
          <stop offset="1" stopColor="#4f7ba6" />
        </linearGradient>
        <radialGradient id="valley-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fcb929" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#f7a948" stopOpacity="0.16" />
          <stop offset="1" stopColor="#f7a948" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="valley-mist" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#eaf2f8" stopOpacity="0" />
          <stop offset="0.3" stopColor="#eaf2f8" stopOpacity="0.22" />
          <stop offset="0.7" stopColor="#eaf2f8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#eaf2f8" stopOpacity="0" />
        </linearGradient>
        <path id="valley-pine" d="M12 -48 L19 -33 L16 -33 L23 -20 L19 -20 L26 -6 L14.5 -6 L14.5 2 L9.5 2 L9.5 -6 L-2 -6 L5 -20 L1 -20 L8 -33 L5 -33 Z" />
      </defs>

      <rect className="v-sky" width="1440" height="600" fill="url(#valley-sky)" />
      <g className="v-sun">
        <circle cx="1010" cy="292" r="190" fill="url(#valley-glow)" />
        <circle cx="1010" cy="292" r="42" fill="#fcb929" />
      </g>

      <g className="v-layer v-far">
        <g className="v-rise">
          <path d="M0 340 C90 318 170 300 260 312 C350 324 420 280 520 262 C600 248 650 270 720 284 C800 300 860 250 950 236 C1040 222 1100 262 1190 270 C1280 278 1360 250 1440 244 L1440 600 L0 600 Z" fill="#24578c" opacity="0.62" />
        </g>
      </g>

      <g className="v-layer v-mist v-mist-high">
        <path d="M-120 350 C200 330 480 346 760 336 C1040 326 1300 344 1560 334 L1560 374 C1300 386 1040 370 760 380 C480 390 200 374 -120 388 Z" fill="url(#valley-mist)" />
      </g>

      <g className="v-layer v-mid">
        <g className="v-rise">
          <path d="M0 410 C120 380 230 372 340 388 C450 404 520 360 640 352 C760 344 840 384 960 380 C1080 376 1150 340 1260 346 C1350 352 1400 372 1440 370 L1440 600 L0 600 Z" fill="#16426f" />
          <g className="pines" fill="#0b2e52">
            {pines.map(([x, y, s]) => (
              <g key={x} transform={`translate(${x} ${y}) scale(${s})`}><use href="#valley-pine" className="pine" /></g>
            ))}
          </g>
        </g>
      </g>

      <g className="v-layer v-mist v-mist-low">
        <path d="M-120 432 C220 414 520 430 820 420 C1100 410 1320 426 1560 418 L1560 452 C1320 462 1100 448 820 458 C520 468 220 452 -120 466 Z" fill="url(#valley-mist)" />
      </g>

      <g className="v-layer v-near">
        <g className="v-rise">
          <path d="M0 470 C160 440 300 452 450 444 C620 436 720 470 880 462 C1040 454 1160 430 1300 436 C1370 440 1410 446 1440 448 L1440 600 L0 600 Z" fill="#0d3260" />
          <g className="fields" fill="none" stroke="#3a6ea6" strokeWidth="2" strokeLinecap="round" opacity="0.55">
            <path pathLength="1" d="M70 486 C190 466 320 470 440 464" />
            <path pathLength="1" d="M40 504 C180 482 330 488 480 480" />
            <path pathLength="1" d="M20 522 C170 500 340 506 520 498" />
            <path pathLength="1" d="M560 486 C650 480 740 492 830 488" />
            <path pathLength="1" d="M540 506 C650 498 760 510 870 506" />
          </g>
          <g className="school" transform="translate(1112 404)">
            <path d="M0 40 L0 18 L30 2 L60 18 L60 40 Z" fill="#0b2d54" stroke="#4b9ce6" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M-5 20 L30 0 L65 20" fill="none" stroke="#fcb929" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
            <rect x="24" y="24" width="12" height="16" fill="#4b9ce6" opacity="0.85" />
            <rect x="7" y="23" width="10" height="8" fill="#4b9ce6" opacity="0.5" />
            <rect x="43" y="23" width="10" height="8" fill="#4b9ce6" opacity="0.5" />
            <path d="M84 40 L84 -16" stroke="#c8d6e5" strokeWidth="1.6" />
            <path className="flag" d="M84 -16 L104 -10 L84 -4 Z" fill="#fcb929" />
          </g>
        </g>
      </g>

      <path className="v-ground" d="M0 562 C240 534 480 550 720 542 C960 534 1200 554 1440 538 L1440 600 L0 600 Z" fill="#f6f8fb" />
    </svg>
  );
}

/** Outline icons, one stroke weight, each beside words that say the same. */
const paths = {
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  megaphone: <><path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1Z" /><path d="M15 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" /></>,
  alert: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.5v.5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  pin: <path d="M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8" />,
  phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 7 8.5-7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  place: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8Z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};
export type IconName = keyof typeof paths;

export function SiteIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="site-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
