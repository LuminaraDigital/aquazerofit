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
      colors: {
        surface: '#0e1416',
        'surface-dim': '#0e1416',
        'surface-bright': '#343a3c',
        'surface-container-lowest': '#090f11',
        'surface-container-low': '#161d1e',
        'surface-container': '#1a2122',
        'surface-container-high': '#242b2d',
        'surface-container-highest': '#2f3638',
        'on-surface': '#dde4e5',
        'on-surface-variant': '#bbc9cd',
        outline: '#859397',
        'outline-variant': '#3c494c',
        'surface-tint': '#2fd9f4',
        primary: '#8aebff',
        'on-primary': '#00363e',
        'primary-container': '#22d3ee',
        'on-primary-container': '#005763',
        secondary: '#45dfa4',
        'on-secondary': '#003825',
        'secondary-container': '#00bd85',
        'on-secondary-container': '#00452e',
        tertiary: '#ffd2d5',
        'on-tertiary': '#67001f',
        'tertiary-container': '#ffaab2',
        'on-tertiary-container': '#94223a',
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
        'primary-fixed-dim': '#2fd9f4',
        'secondary-fixed-dim': '#45dfa4',
        'tertiary-fixed-dim': '#ffb2b9',
        'border-aqua': '#1E4C74',
        coral: '#ffb2b9',
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