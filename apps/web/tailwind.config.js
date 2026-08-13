/**
 * Tailwind theme mapped to the "Modern Aquatic Wellness" design tokens
 * (Figma_aquazerofit_wellness_platform/modern_aquatic_wellness/DESIGN.md).
 *
 * Extended with a tier system: hero/standard/compact card variants,
 * asymmetric section spacing, and custom shadow language.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * Every palette entry resolves through an `--azf-*` custom property
       * declared in src/styles/index.css rather than a literal hex.
       *
       * Why the indirection: the Telegram Mini App has to be able to adopt the
       * host client's colours, and the only way to do that without every
       * component opting in one by one is to make the token layer itself the
       * binding point. The channel-triplet form (`14 20 22`) is deliberate —
       * it is the only shape that keeps Tailwind's alpha modifiers
       * (`border-outline-variant/50`) working through a variable, so nothing
       * downstream had to change. Defaults live in CSS and are the exact
       * values this palette shipped with; see styles/tokens.test.ts.
       */
      colors: {
        surface: 'rgb(var(--azf-surface) / <alpha-value>)',
        'surface-dim': 'rgb(var(--azf-surface-dim) / <alpha-value>)',
        'surface-bright': 'rgb(var(--azf-surface-bright) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--azf-surface-container-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--azf-surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--azf-surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--azf-surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--azf-surface-container-highest) / <alpha-value>)',
        'on-surface': 'rgb(var(--azf-on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--azf-on-surface-variant) / <alpha-value>)',
        outline: 'rgb(var(--azf-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--azf-outline-variant) / <alpha-value>)',
        'surface-tint': 'rgb(var(--azf-surface-tint) / <alpha-value>)',
        primary: 'rgb(var(--azf-primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--azf-on-primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--azf-primary-container) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--azf-on-primary-container) / <alpha-value>)',
        secondary: 'rgb(var(--azf-secondary) / <alpha-value>)',
        'on-secondary': 'rgb(var(--azf-on-secondary) / <alpha-value>)',
        'secondary-container': 'rgb(var(--azf-secondary-container) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--azf-on-secondary-container) / <alpha-value>)',
        tertiary: 'rgb(var(--azf-tertiary) / <alpha-value>)',
        'on-tertiary': 'rgb(var(--azf-on-tertiary) / <alpha-value>)',
        'tertiary-container': 'rgb(var(--azf-tertiary-container) / <alpha-value>)',
        'on-tertiary-container': 'rgb(var(--azf-on-tertiary-container) / <alpha-value>)',
        error: 'rgb(var(--azf-error) / <alpha-value>)',
        'on-error': 'rgb(var(--azf-on-error) / <alpha-value>)',
        'error-container': 'rgb(var(--azf-error-container) / <alpha-value>)',
        'on-error-container': 'rgb(var(--azf-on-error-container) / <alpha-value>)',
        'primary-fixed-dim': 'rgb(var(--azf-primary-fixed-dim) / <alpha-value>)',
        'secondary-fixed-dim': 'rgb(var(--azf-secondary-fixed-dim) / <alpha-value>)',
        'tertiary-fixed-dim': 'rgb(var(--azf-tertiary-fixed-dim) / <alpha-value>)',
        'border-aqua': 'rgb(var(--azf-border-aqua) / <alpha-value>)',
        coral: 'rgb(var(--azf-coral) / <alpha-value>)',
      },
      fontFamily: {
        heading: ['"Barlow Condensed"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        xl: '16px',
        '2xl': '20px',
      },
      spacing: {
        'container-margin': '1.25rem',
        'card-padding': '1.25rem',
        'section-gap': '2rem',
        'section-sm': '0.75rem',
        'section-md': '1.25rem',
        'section-lg': '2rem',
      },
      boxShadow: {
        'glow-sm': '0 0 12px -2px rgba(138, 235, 255, 0.25)',
        'glow-md': '0 0 20px -2px rgba(138, 235, 255, 0.3)',
        'cta': '0 4px 12px -4px rgba(47, 217, 244, 0.35)',
        'card': '0 4px 16px -8px rgba(0, 0, 0, 0.3)',
        'card-hero': '0 8px 24px -12px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'reveal': 'reveal-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        'reveal-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
};