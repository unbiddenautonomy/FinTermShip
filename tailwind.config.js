/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        wordmark: ['Outfit', 'Manrope', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Colours come from CSS variables in index.css, so light and dark mode share one set of class names.
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        sunken: token('sunken'),
        line: token('line'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        brand: { DEFAULT: token('brand'), strong: token('brand-strong'), soft: token('brand-soft'), ink: token('brand-ink') },
        good: { DEFAULT: token('good'), strong: token('good-strong'), soft: token('good-soft'), ink: token('good-ink') },
        bad: { DEFAULT: token('bad'), strong: token('bad-strong'), soft: token('bad-soft'), ink: token('bad-ink') },
        sky: { DEFAULT: token('sky'), soft: token('sky-soft'), ink: token('sky-ink') },
        amber: { DEFAULT: token('amber'), soft: token('amber-soft'), ink: token('amber-ink') },
        violet: { DEFAULT: token('violet'), soft: token('violet-soft'), ink: token('violet-ink') },
      },
      boxShadow: {
        press: '0 3px 0 0 rgb(var(--brand-strong))',
        'press-bad': '0 3px 0 0 rgb(var(--bad-ink))',
        'press-line': '0 2px 0 0 rgb(var(--line))',
        card: '0 1px 2px 0 rgb(20 40 30 / 0.04), 0 1px 3px 0 rgb(20 40 30 / 0.06)',
        sheet: '0 -8px 24px -12px rgb(16 24 40 / 0.18)',
      },
      keyframes: {
        sheet: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        tape: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: { '0%': { transform: 'translateY(14px) scale(0.97)', opacity: '0' }, '100%': { transform: 'none', opacity: '1' } },
        grow: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        // A damped shake: each swing smaller than the last, like a head shake that settles.
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '15%': { transform: 'translateX(-7px)' },
          '35%': { transform: 'translateX(5px)' },
          '55%': { transform: 'translateX(-3px)' },
          '75%': { transform: 'translateX(1.5px)' },
        },
        // The next question slides in from the right, as if the lesson moved along.
        enter: { '0%': { transform: 'translateX(28px)', opacity: '0' }, '100%': { transform: 'none', opacity: '1' } },
        // A right answer swells and settles.
        bump: { '0%': { transform: 'scale(1)' }, '35%': { transform: 'scale(1.045)' }, '65%': { transform: 'scale(0.99)' }, '100%': { transform: 'scale(1)' } },
        // A soft ring that spreads out from a right answer and fades.
        halo: { '0%': { boxShadow: '0 0 0 0 rgb(var(--good) / 0.45)' }, '100%': { boxShadow: '0 0 0 12px rgb(var(--good) / 0)' } },
        // An icon that springs in from nothing.
        'pop-in': { '0%': { transform: 'scale(0.3)', opacity: '0' }, '60%': { transform: 'scale(1.15)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        // The missing word drops into its gap.
        drop: { '0%': { transform: 'translateY(-14px) scale(0.85)', opacity: '0' }, '60%': { transform: 'translateY(2px) scale(1.04)', opacity: '1' }, '100%': { transform: 'none' } },
        // The streak flame flares when the run grows.
        flare: { '0%': { transform: 'scale(1)' }, '30%': { transform: 'scale(1.4) rotate(-8deg)' }, '60%': { transform: 'scale(0.95) rotate(4deg)' }, '100%': { transform: 'scale(1)' } },
        // A rubber stamp landing on a card.
        stamp: { '0%': { transform: 'scale(1.8) rotate(-10deg)', opacity: '0' }, '55%': { transform: 'scale(0.94) rotate(-3deg)', opacity: '1' }, '100%': { transform: 'scale(1) rotate(-3deg)', opacity: '1' } },
        // The next card lifts off the deck into play.
        deal: { '0%': { transform: 'translateY(10px) rotate(2.5deg) scale(0.96)' }, '100%': { transform: 'none' } },
        // A piece of confetti: thrown out along (--x, --y), then falling with a spin.
        burst: {
          '0%': { transform: 'translate(0, 0) rotate(0deg) scale(0.6)', opacity: '1' },
          '45%': { transform: 'translate(var(--x), var(--y)) rotate(calc(var(--r) * 0.5)) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(calc(var(--x) * 1.25), calc(var(--y) + 90px)) rotate(var(--r)) scale(0.9)', opacity: '0' },
        },
      },
      transitionTimingFunction: {
        // Overshoots a little and settles: for things that should feel physical.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring-soft': 'cubic-bezier(0.3, 1.25, 0.5, 1)',
      },
      animation: {
        sheet: 'sheet 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        pop: 'pop 180ms ease-out',
        shake: 'shake 420ms ease-out',
        enter: 'enter 340ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        bump: 'bump 420ms cubic-bezier(0.3, 1.25, 0.5, 1)',
        'bump-halo': 'bump 420ms cubic-bezier(0.3, 1.25, 0.5, 1), halo 650ms ease-out',
        'pop-in': 'pop-in 380ms cubic-bezier(0.3, 1.25, 0.5, 1) both',
        drop: 'drop 420ms cubic-bezier(0.3, 1.25, 0.5, 1) both',
        flare: 'flare 520ms cubic-bezier(0.3, 1.25, 0.5, 1)',
        stamp: 'stamp 360ms cubic-bezier(0.3, 1.25, 0.5, 1) 220ms both',
        deal: 'deal 360ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards',
        burst: 'burst 1100ms cubic-bezier(0.2, 0.7, 0.4, 1) both',
        fade: 'fade 160ms ease-out',
        rise: 'rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        grow: 'grow 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        tape: 'tape 60s linear infinite',
      },
    },
  },
  plugins: [],
};
