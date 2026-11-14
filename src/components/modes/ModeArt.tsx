/**
 * Each mode's own colours and a small scene drawn in its screen's style: the switch button's tile
 * and the cards in the mode picker. Plain SVG, so it costs nothing to load.
 */
import type { ReactNode } from 'react';
import type { ModeId } from '../../lib/modes/ids';

export interface ModeLook {
  /** Tile background and the icon drawn on it. */
  tile: string;
  ink: string;
  /** The accent for rings and chips on the picker card. */
  accent: string;
}

export const MODE_LOOK: Record<ModeId, ModeLook> = {
  path: { tile: '#184E39', ink: '#F2C48D', accent: '#C9844A' },
  lines: { tile: '#2E86AB', ink: '#FFFFFF', accent: '#2E86AB' },
  callit: { tile: '#2347B8', ink: '#FFFFFF', accent: '#FF4F9A' },
  exchange: { tile: '#0C1311', ink: '#4FD18B', accent: '#2FA36B' },
  headline: { tile: '#161616', ink: '#ECEBE5', accent: '#B3261E' },
  finnections: { tile: '#3B3058', ink: '#F2C66D', accent: '#7A62C9' },
};

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 320 128" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
    {children}
  </svg>
);

/** The scene at the top of each picker card. */
export const MODE_ART: Record<ModeId, ReactNode> = {
  path: svg(
    <>
      <rect width="320" height="128" fill="#184E39" />
      <circle cx="270" cy="22" r="60" fill="#1F5C44" />
      <path d="M-10 108 C 60 108, 60 64, 120 64 S 190 22, 250 34 S 300 70, 340 58" fill="none" stroke="#0E3626" strokeWidth="16" strokeLinecap="round" />
      <path d="M-10 108 C 60 108, 60 64, 120 64 S 190 22, 250 34 S 300 70, 340 58" fill="none" stroke="#C9844A" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" />
      {[
        [34, 104, 'done'],
        [92, 74, 'done'],
        [150, 56, 'done'],
        [206, 32, 'now'],
        [272, 44, 'next'],
      ].map(([x, y, s]) => (
        <g key={`${x}`}>
          {s === 'now' && <circle cx={x as number} cy={y as number} r="17" fill="#F2C48D" opacity=".25" />}
          <circle cx={x as number} cy={y as number} r="11" fill={s === 'next' ? '#184E39' : s === 'now' ? '#F2C48D' : '#C9844A'} stroke={s === 'next' ? '#5E8C76' : '#0E3626'} strokeWidth="3" />
          {s === 'done' && <path d={`M${(x as number) - 4.5} ${y} l3 3 6-6`} fill="none" stroke="#0E3626" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      ))}
    </>,
  ),
  lines: svg(
    <>
      <rect width="320" height="128" fill="#FAF8F2" />
      <path d="M0 0H320" stroke="#E7E3D8" />
      <path d="M-10 36 H120 L160 76 H330" fill="none" stroke="#E5A50A" strokeWidth="9" strokeLinejoin="round" />
      <path d="M-10 100 H90 L160 76 L210 26 H330" fill="none" stroke="#2E86AB" strokeWidth="9" strokeLinejoin="round" />
      <path d="M160 -10 V138" fill="none" stroke="#C3176F" strokeWidth="9" />
      {[
        [40, 36],
        [92, 36],
        [40, 100],
        [250, 76],
        [300, 76],
        [256, 26],
        [160, 20],
        [160, 116],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="#FFFFFF" stroke="#1B1B1B" strokeWidth="2.5" />
      ))}
      <rect x="146" y="64" width="28" height="24" rx="12" fill="#FFFFFF" stroke="#1B1B1B" strokeWidth="3" />
    </>,
  ),
  callit: svg(
    <>
      <rect width="320" height="128" fill="#E9ECF3" />
      <pattern id="dots-callit" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="#C9CEDB" />
      </pattern>
      <rect width="320" height="128" fill="url(#dots-callit)" />
      <g transform="rotate(-6 160 70)">
        <rect x="86" y="24" width="150" height="96" fill="#FF4F9A" />
      </g>
      <g transform="rotate(4 160 70)">
        <rect x="92" y="20" width="150" height="96" fill="#2347B8" />
      </g>
      <rect x="84" y="16" width="150" height="96" fill="#FBFBF8" stroke="#141414" strokeWidth="3" />
      <rect x="98" y="30" width="56" height="5" fill="#9AA0AE" />
      <rect x="98" y="56" width="112" height="10" fill="#141414" />
      <rect x="98" y="72" width="74" height="10" fill="#2347B8" />
      <rect x="20" y="88" width="50" height="22" fill="#FF4F9A" stroke="#141414" strokeWidth="2.5" />
      <path d="M38 99h14m-14 0 5-5m-5 5 5 5" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="250" y="88" width="50" height="22" fill="#2347B8" stroke="#141414" strokeWidth="2.5" />
      <path d="M268 99h14m0 0-5-5m5 5-5 5" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>,
  ),
  exchange: svg(
    <>
      <rect width="320" height="128" fill="#0C1311" />
      <rect width="320" height="22" fill="#070B0A" />
      {['BID 82 ▲4', 'VWAP 61 ▼2', 'REPO 77 ▲1', 'IV 40 ▼6'].map((t, i) => (
        <text key={t} x={10 + i * 80} y="15" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="700" fill={t.includes('▲') ? '#4FD18B' : '#FF7A6E'}>
          {t}
        </text>
      ))}
      <path d="M0 100 L30 96 L60 102 L90 84 L120 88 L150 70 L180 76 L210 56 L240 62 L270 40 L300 46 L320 34 V128 H0Z" fill="#4FD18B" opacity=".12" />
      <path d="M0 100 L30 96 L60 102 L90 84 L120 88 L150 70 L180 76 L210 56 L240 62 L270 40 L300 46 L320 34" fill="none" stroke="#4FD18B" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="300" cy="46" r="4" fill="#4FD18B" />
      <text x="14" y="52" fontFamily="ui-monospace, monospace" fontSize="26" fontWeight="700" fill="#E6ECE8">
        782.4
      </text>
      <text x="16" y="68" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="700" fill="#4FD18B">
        ▲ 12.6 FTS
      </text>
    </>,
  ),
  headline: svg(
    <>
      <rect width="320" height="128" fill="#ECEBE5" />
      <text x="18" y="22" fontFamily="Georgia, serif" fontSize="11" fontWeight="700" letterSpacing="2" fill="#161616">
        THE MARKET DESK
      </text>
      <path d="M18 28h284M18 31h284" stroke="#161616" strokeWidth="1.2" />
      <rect x="18" y="38" width="210" height="13" fill="#161616" />
      <rect x="18" y="55" width="150" height="13" fill="#161616" />
      <rect x="18" y="73" width="120" height="4" fill="#8A887F" />
      {[84, 104].map((y, i) => (
        <g key={y}>
          <rect x="18" y={y} width="284" height="16" fill="#F7F6F2" stroke="#C9C7BD" />
          <rect x="26" y={y + 6} width={i ? 90 : 120} height="4" fill="#3D3D3D" />
          <rect x="236" y={y + 3} width="28" height="10" fill={i ? 'none' : '#1D6B45'} stroke={i ? '#161616' : '#1D6B45'} />
          <rect x="268" y={y + 3} width="28" height="10" fill={i ? '#B3261E' : 'none'} stroke={i ? '#B3261E' : '#161616'} />
        </g>
      ))}
    </>,
  ),
  finnections: svg(
    <>
      <rect width="320" height="128" fill="#F3F1FA" />
      <rect x="60" y="10" width="200" height="22" rx="6" fill="#F2C66D" />
      <rect x="118" y="18" width="84" height="6" rx="3" fill="#1A1625" opacity=".7" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => {
          if (r === 3) return null;
          const sel = (r === 0 && (c === 1 || c === 3)) || (r === 1 && c === 0);
          return <rect key={`${r}${c}`} x={60 + c * 51} y={38 + r * 28} width="47" height="23" rx="5" fill={sel ? '#3B3058' : '#E2DEF0'} />;
        }),
      )}
    </>,
  ),
};
