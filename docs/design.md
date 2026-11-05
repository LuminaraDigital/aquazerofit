# AquaZeroFit design direction: Corner Card

This is the source for how AquaZeroFit looks on Android, on the web and in the
Telegram Mini App. It replaces the "Modern Aquatic Wellness" sheet in
`design/figma/modern_aquatic_wellness/DESIGN.md`. That file still holds the raw
palette the code was ported from, but where the two disagree, this file wins.

## Brief

- **Audience and their job.** Someone logging food, water and training a few
  times a day, usually one-handed and between other things. They need to see
  where the day stands and log the next thing in one or two taps.
- **The one message.** You have a corner. A coach from the AZX league works
  your day with you, and the numbers are honest.
- **Constraints.** Dark ground (`#0E1416`), Barlow Condensed and DM Sans,
  Material Symbols, the AZX fight-league world and its 28 coach personas.
  Android uses Jetpack Compose, the web uses React with Tailwind, and the
  Telegram Mini App adopts the host's colours through the same tokens. The web
  CSP allows no inline scripts or styles without the nonce.

## Direction

**Corner Card: the fight-broadcast graphics system, applied to a wellness
day.** Flat surfaces, hairline rules, condensed capitals for labels and large
tabular numerals for the figures that matter. No glows.

The motifs come from a fight's own paperwork: the bout sheet, the weigh-in
readout, the tale of the tape, the round clock, the judges' scorecard and the
belt rank. Water (the "Aqua" in the name) supplies the single accent colour.

References, and the move taken from each:

- **Fight broadcast "tale of the tape" graphics (DAZN, UFC):** condensed
  capitals for each label over a large right-aligned numeral, with rows
  separated by hairlines instead of boxes.
- **Strava activity summaries:** one number per view carries the screen, with
  the unit small and attached to it.
- **Linear:** depth comes from surfaces that step up in lightness and from
  1dp hairlines, never from shadows or light effects.

**Signature move: scoreboard numerals.** The figure that answers each screen's
question ("how much is left today", "what did I lift", "where is my weight
going") is set in Barlow Condensed with tabular figures, at display size, on a
ruled stat row. On the website the same numerals carry the first frame.

### What this retires

| Retired | Why | Replacement |
|---|---|---|
| `AquaAura` radial glow behind first folds | a decorative glow that depicts nothing | flat `background` |
| 135° aqua→mint gradient on primary buttons | gradient CTAs are a generic tell and weaken the accent | solid `primaryFixedDim` fill with `onPrimaryFixed` ink, 10.1:1 |
| Gradient fill and gradient edge on `AzfHeroSurface` | a second glow treatment competing with the button | `surfaceContainer` with a 2dp accent rule on the leading edge of the label |
| Rotating gradient border on `GlowFrame` | a "border beam": motion that says nothing | static 1.5dp accent outline while active |
| Gradient user chat bubble | the gradient made the user's words louder than the coach's | `surfaceContainerHighest` bubble with `onSurface` text |
| Six radii (8, 12, 16, 20, 24, 28, 30) | no two screens nested corners the same way | two radii plus pill (below) |

Mint (`secondary`) becomes a semantic colour. It means "goal met" or "done"
and nothing else. Coral is the only colour for weight gain and is never red.

## Tokens

Each platform implements these values itself:
`apps/android/.../core/designsystem/` (`AzfColors`, `Type`, `Shapes`,
`AzfSpacing`, `Motion`) and `apps/web/src/styles/index.css` with
`apps/web/tailwind.config.js`. When a value changes, change it in both.

### Colour

The ground and the tonal surfaces carry about 70% of every screen. Aqua is the
accent and marks the one thing to do or read next. Semantic colours never
stand in for the accent.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `surface` / `background` | `#0E1416` | the ground | — |
| `surfaceContainerLow` | `#161D1E` | standard card | — |
| `surfaceContainer` | `#1A2122` | lead card, sheets | — |
| `surfaceContainerHigh` | `#242B2D` | inputs, pressed rows, chips | — |
| `surfaceContainerHighest` | `#2F3638` | user chat bubble, selected chip | — |
| `onSurface` | `#DDE4E5` | primary text | 14.4:1 on ground |
| `onSurfaceVariant` | `#BBC9CD` | secondary text | 10.9:1 on ground, 9.6:1 on card |
| `outline` | `#859397` | input borders, tertiary text | 5.9:1 on ground |
| `outlineVariant` | `#3C494C` | decorative hairlines only | 2.0:1: never text, never the only boundary of a control |
| `primary` | `#8AEBFF` | accent text and icons | 13.6:1 on ground |
| `primaryFixedDim` | `#2FD9F4` | filled primary button, active rule | 10.1:1 under `onPrimaryFixed` |
| `onPrimaryFixed` | `#001F25` | ink on aqua fills | — |
| `secondary` (success) | `#45DFA4` | goal met, done | 10.1:1 on card |
| `warning` | `#FFC45A` | needs attention | 10.8:1 on card |
| `coral` | `#FFB2B9` | weight gain only | 10.0:1 on card |
| `error` | `#FFB4AB` | failures | — |

The app is dark-only by design. Depth on dark comes from lightness: a raised
surface is lighter, never shadowed.

### Type

Two families. Barlow Condensed SemiBold (uppercase, tracked) for titles,
labels and numerals. DM Sans for everything people read.

| Role | Family | Size / line | Tracking | Use |
|---|---|---|---|---|
| `scoreboard` | Barlow Condensed, `tnum` | 56 / 56 | 0 | the one figure per screen |
| `displayLarge` | Barlow Condensed | 48 / 52 | +4% | onboarding and paywall headlines |
| `headlineLarge` | Barlow Condensed | 32 / 36 | +3% | rarely: celebration headlines |
| `headlineMedium` | Barlow Condensed | 24 / 28 | +2% | **every screen title**, through `AzfAppHeader` |
| `headlineSmall` | Barlow Condensed | 20 / 24 | +2% | card titles, empty and error titles |
| `statLabel` | Barlow Condensed | 14 / 16 | +8% | section labels and stat-row labels, uppercase, `onSurfaceVariant` |
| `dataLarge` | DM Sans Bold, `tnum` | 32 / 32 | 0 | secondary figures |
| `titleMedium` | DM Sans SemiBold | 16 / 22 | 0 | list-row titles, button labels |
| `bodyLarge` | DM Sans | 18 / 28 | 0 | coach messages |
| `bodyMedium` | DM Sans | 16 / 24 | 0 | default reading text |
| `bodySmall` | DM Sans | 13 / 18 | 0 | captions, attributions |
| `labelLarge` | DM Sans Medium | 14 / 20 | +1% | chips, tabs |

Nothing people read goes below 13sp. Every changing or aligned digit uses
tabular figures.

### Space

A 4dp grid. `ContainerMargin` 20, `CardPadding` 16, `Gutter` 12 between cards
in a section, `SectionGap` 32 between sections, `ElementGapSmall` 8,
`ElementGapMedium` 16. Related things sit closer together than unrelated ones:
a label sits 4dp above its value and a section label 12dp above its card.

### Radii

Two radii and a pill, nested concentrically: an inner tile inset 8dp inside a
16dp card takes the 8dp radius.

| Token | Value | Use |
|---|---|---|
| `Control` | 8dp | buttons, inputs, inner tiles, image thumbnails |
| `Card` | 16dp | cards, sheets (top corners), the bottom dock, the composer |
| `Pill` | 50% | chips, avatars, the log button, progress tracks |

### Elevation

No shadows on surfaces. A card is a tonal step (`surfaceContainerLow` on the
ground) with a 1dp `outlineVariant` hairline at 60% alpha. The lead card on a
screen is `surfaceContainer` with no hairline and a 2dp aqua rule before its
label. There is one lead card per screen at most.

### Motion

Every animation orients, confirms, bridges two states or draws the eye once.
`AzfMotion` holds the values, and all of them fall back to instant states when
system animations are off.

| Token | Value | Purpose |
|---|---|---|
| `RevealDurationMs` | 360ms, `cubic-bezier(0.16, 1, 0.3, 1)` | first appearance of a screen's sections |
| `RevealRise` | 8dp, with opacity from 0 | orientation, not travel |
| `RevealStaggerMs` | 40ms, capped at 6 items | one leader, followers close behind |
| `PressScale` | 0.97 on a spring | confirms contact |
| `ConfirmDurationMs` | 220ms | a tick, a tab lighting up |
| `ScreenEnterMs` / `ScreenExitMs` | 280 / 190ms | screen changes; the exit is about 30% faster |

Tabs are visited all day, so their entrance stays short. Only once-per-session
moments (rank-up, onboarding finish) earn longer motion.

## Components

All of these live in `:core:designsystem` and are the only way a feature
draws these things. A feature that needs a variant adds a parameter here; it
never copies the component.

- **`AzfAppHeader`**: every screen title. `headlineMedium`, uppercase, marked
  as a heading for TalkBack, 48dp back button.
- **`AzfSectionLabel`**: the `statLabel` line above a group of content.
- **`AzfCard`**: Standard and Compact tiers. `AzfHeroSurface` is the lead card.
- **`AzfStatRow`**: label left in `statLabel`, value right in tabular
  numerals, hairline below. Used for the tale-of-the-tape figures.
- **`PrimaryButton` / `SecondaryButton`**: 56dp tall, `Control` radius. One
  primary per view.
- **`AzfAsyncContent`**: the single loading → empty → error → content switch.
  Loading shows a skeleton shaped like the content, never a bare spinner on a
  full screen. Errors say what happened, what still works, and offer a retry.
- **`EmptyState` / `ErrorState` / `Skeleton`**: the parts `AzfAsyncContent`
  composes, also usable on their own inside a card.

### Accessibility floor

- Every interactive element is at least 48dp in both directions.
- Every icon-only control has a content description. Decorative icons pass
  `null` and sit beside text that says the same thing.
- Screen titles are headings, so TalkBack users can jump between them.
- Text pairs meet WCAG AA at least; the table above lists the measured ratios.

## Web

The website and the in-app web screens use the same tokens through the
`--azf-*` custom properties. On the marketing pages:

- The first frame carries the message, the Google Play button and the
  signature move: real figures from the product in scoreboard numerals beside
  a real screenshot of the app.
- Screenshots are real captures of the release build, never mock-ups.
- Every number on the page exists in the product code and is cited in a
  comment next to it.
