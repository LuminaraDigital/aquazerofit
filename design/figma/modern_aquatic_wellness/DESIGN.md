---
name: Modern Aquatic Wellness
colors:
  surface: '#0e1416'
  surface-dim: '#0e1416'
  surface-bright: '#343a3c'
  surface-container-lowest: '#090f11'
  surface-container-low: '#161d1e'
  surface-container: '#1a2122'
  surface-container-high: '#242b2d'
  surface-container-highest: '#2f3638'
  on-surface: '#dde4e5'
  on-surface-variant: '#bbc9cd'
  inverse-surface: '#dde4e5'
  inverse-on-surface: '#2b3233'
  outline: '#859397'
  outline-variant: '#3c494c'
  surface-tint: '#2fd9f4'
  primary: '#8aebff'
  on-primary: '#00363e'
  primary-container: '#22d3ee'
  on-primary-container: '#005763'
  inverse-primary: '#006877'
  secondary: '#45dfa4'
  on-secondary: '#003825'
  secondary-container: '#00bd85'
  on-secondary-container: '#00452e'
  tertiary: '#ffd2d5'
  on-tertiary: '#67001f'
  tertiary-container: '#ffaab2'
  on-tertiary-container: '#94223a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a2eeff'
  primary-fixed-dim: '#2fd9f4'
  on-primary-fixed: '#001f25'
  on-primary-fixed-variant: '#004e5a'
  secondary-fixed: '#68fcbf'
  secondary-fixed-dim: '#45dfa4'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdadc'
  tertiary-fixed-dim: '#ffb2b9'
  on-tertiary-fixed: '#400010'
  on-tertiary-fixed-variant: '#891933'
  background: '#0e1416'
  on-background: '#dde4e5'
  surface-variant: '#2f3638'
typography:
  display-lg:
    fontFamily: Barlow Condensed
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: 0.04em
  headline-lg:
    fontFamily: Barlow Condensed
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: 0.03em
  headline-md:
    fontFamily: Barlow Condensed
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.02em
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  data-lg:
    fontFamily: DM Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 32px
  data-sm:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 1.25rem
  gutter: 1rem
  card-padding: 1.25rem
  section-gap: 2rem
  element-gap-sm: 0.5rem
  element-gap-md: 1rem
---

## Brand & Style
The design system embodies "Modern Aquatic Wellness," a high-performance aesthetic that balances the tranquil depth of the ocean with the vibrant energy of elite fitness. It targets a premium audience seeking a serene yet data-rich environment for health optimization.

The style is a hybrid of **Minimalism** and **Glassmorphism**, utilizing deep, immersive backgrounds punctuated by glowing, high-contrast interactive elements. The UI should evoke a sense of "digital hydration"—fluid, clean, and refreshing. Layouts are strictly card-based to maintain order within a mobile-first context, using soft depth and subtle light-leaks to create a premium feel.

## Colors
The palette is built on a "Deep Sea" foundation. The background utilizes a dark, monochromatic blue scale to reduce eye strain and highlight data. 

- **Primary Background:** Deep Ocean provides the canvas.
- **Surface Hierarchy:** Higher elevation cards use lighter shades of navy to create depth without relying on heavy shadows.
- **Vibrant Accents:** Aqua is the primary engine for progress and action. Sea Green and Coral are reserved for specific physiological metrics (protein vs. energy) to provide immediate semantic recognition.
- **Gradients:** Use the CTA Gradient exclusively for primary conversion points and completed goal states to signify high-energy achievement.

## Typography
The typographic system uses a high-contrast pairing to distinguish between instructional content and motivational headers.

- **Headings:** Barlow Condensed provides an athletic, high-energy feel. The generous letter spacing and uppercase styling evoke a premium, editorial fitness look.
- **Body & Data:** DM Sans is chosen for its exceptional legibility on mobile. For all numeric displays—such as calorie counts, timers, and weights—enable `tabular-nums` to ensure columns of numbers align perfectly during real-time updates.

## Layout & Spacing
This design system utilizes a **mobile-first fluid grid**. The layout relies on a generous 20px (1.25rem) side margin for the primary container to ensure content feels spacious and "breathable."

- **Card Architecture:** Content is grouped into cards. Cards should generally span the full width of the container minus margins.
- **Vertical Rhythm:** Use 32px (2rem) between major sections and 16px (1rem) between cards within a section.
- **Safe Areas:** Ensure bottom navigation and floating action buttons (FABs) respect device-specific safe area insets to maintain the premium, intentional feel.

## Elevation & Depth
Elevation is achieved through a combination of **Tonal Layering** and **Subtle Outlines** rather than heavy shadows.

- **Level 0 (Background):** Deep Ocean #071A2B.
- **Level 1 (Cards):** Abyss Navy or Surface Card colors with a 1px solid border (#1E4C74) to define edges in the dark environment.
- **Level 2 (Active/Overlays):** Use a 10% Aqua tint on card backgrounds or a soft 20px blur shadow with 15% opacity to indicate interaction.
- **Backdrop Blur:** For modals and navigation bars, apply a 12px backdrop blur with a semi-transparent Abyss Navy fill to create a glass-like "submerged" effect.

## Shapes
The shape language is "Liquid Geometric." 

- **Cards:** Use a consistent 20px corner radius.
- **Interactive Elements:** Buttons and chips use high roundedness (16px to full pill) to feel comfortable and tactile.
- **Progress Indicators:** Use perfect circles for rings and fully rounded end-caps for linear progress bars to mimic water droplets or fluid flow.

## Components
- **Buttons:** Primary buttons use the CTA Gradient with white text (Primary Text). Secondary buttons use a transparent background with the 1px Aqua border. All buttons have a minimum height of 56px for mobile tap targets.
- **Progress Rings:** Use a 4px-8px stroke width. The track should be the Border Color (#1E4C74) and the active fill should be Aqua or Sea Green.
- **Navigation:** A fixed bottom bar with 5 items. The active state is indicated by a glowing Aqua icon and a subtle 4px top indicator line.
- **Input Fields:** Semi-transparent Navy backgrounds with 16px radius. The border glows Aqua when focused.
- **Chips/Badges:** Small, pill-shaped markers for labels like "High Protein" or "New Workout." Use low-opacity versions of the accent colors (e.g., 15% Coral background with 100% Coral text).
- **Iconography:** Use rounded-line SVG icons with a 1.5px stroke weight to match the "soft but precise" brand personality.