import type { ReactNode } from 'react';

type IconProps = { className?: string };

function Svg({ className = 'h-5 w-5', children, fill = 'none' }: IconProps & { children: ReactNode; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** The app logo: the copper bull and bear medallion (public/logo.webp, cut from the brand artwork). */
export function Logo({ className = 'h-8 w-8' }: IconProps) {
  return <img src="/logo.webp" alt="" width={192} height={192} className={`${className} shrink-0 rounded-full shadow-sm`} draggable={false} />;
}

export const Flame = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <path stroke="none" d="M12 2c.6 3.2 2.3 4.9 3.9 6.5C17.5 10.1 19 11.7 19 14.5A7 7 0 0 1 5 14.5c0-2.2 1-3.9 2.4-5.2.3 1.6 1 2.7 2.1 3.3C9.2 8.4 10.3 4.9 12 2Z" />
  </Svg>
);

export const Bolt = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <path stroke="none" d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.5L13.5 2Z" />
  </Svg>
);

export const PathIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19 9 13l4 3 7-9" />
    <path d="M15 7h5v5" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12Z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
  </Svg>
);

export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </Svg>
);

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const Cross = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const Speaker = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a10 10 0 0 1 0 14" />
  </Svg>
);

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const Sparkle = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <path stroke="none" d="M12 2.5c.5 4.6 2.4 6.6 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.4 6.5-2.4 7-7Z" />
    <path stroke="none" d="M19 15.5c.2 1.8 1 2.6 2.8 2.8-1.8.2-2.6 1-2.8 2.8-.2-1.8-1-2.6-2.8-2.8 1.8-.2 2.6-1 2.8-2.8Z" />
  </Svg>
);

export const Calculator = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
    <path d="M8.5 6.5h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3M8.5 18h.01M12 18h.01" />
  </Svg>
);

export const Scale = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M7 21h10M5 7h14" />
    <path d="m5 7-3 6a3 3 0 0 0 6 0L5 7ZM19 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
  </Svg>
);

export const Quote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h10M4 17h7" />
  </Svg>
);

export const Pairs = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="7" height="6" rx="1.5" />
    <rect x="14" y="14" width="7" height="6" rx="1.5" />
    <path d="M10 7h2a2 2 0 0 1 2 2v6" />
  </Svg>
);

export const Target = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

export const Lock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const Refresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 20v-4h-4" />
  </Svg>
);

export const Dice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth="3" />
  </Svg>
);

export const Briefcase = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Svg>
);

/** Term Lines: two metro lines meeting at an interchange. */
export const LinesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h7l4 10h7" />
    <path d="M3 17h7l4-10h7" />
    <circle cx="12" cy="12" r="2" />
  </Svg>
);

/** Call It: a card with a tick and a cross. */
export const CallIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="3" />
    <path d="m8.5 9 1.5 1.5L13 7.5" />
    <path d="m11 14 4 4M15 14l-4 4" />
  </Svg>
);

/** Recall Exchange: a candle chart. */
export const TickerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4v16M12 3v18M18 6v12" />
    <rect x="4" y="8" width="4" height="7" rx="1" />
    <rect x="10" y="6" width="4" height="5" rx="1" />
    <rect x="16" y="10" width="4" height="5" rx="1" />
  </Svg>
);

export const ArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

/** Headline Desk: a folded newspaper. */
export const PaperIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5Z" />
    <path d="M17 9h3v9a2 2 0 0 1-4 0" />
    <path d="M7 9h7M7 13h7M7 16h4" />
  </Svg>
);

/** Finnections: a four-by-four grid with one row found. */
export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="4" rx="1.5" />
    <path d="M3 11h4v4H3zM10 11h4v4h-4zM17 11h4v4h-4zM3 18h4v3H3zM10 18h4v3h-4zM17 18h4v3h-4z" />
  </Svg>
);

/** The More button: four tiles. */
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <path d="M16.75 13.5v6.5M13.5 16.75H20" />
  </Svg>
);
