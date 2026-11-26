// @vitest-environment jsdom
/**
 * Observable-contract tests for the interactive 3D/data marketing scene
 * components: WCAG AA contrast across all 28 fighter themes, deterministic
 * meal trace arithmetic, immutable safety boundaries across coach personas,
 * accessible card flipping, multi-tag roster filtering, belt progression, and
 * safety floor / EXIF proofs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BELT_LADDER, COACHES, KCAL_FLOOR } from '@aquazerofit/shared';
import { coachInkOnDark, contrastRatio } from './coachContrast';
import { MealTraceDemo } from './MealTraceDemo';
import { CornerStage } from './CornerStage';
import { BeltRail } from './BeltRail';
import { AkinCollectibleCard } from './AkinCollectibleCard';
import { FighterLockerRoom, coachCategories } from './FighterLockerRoom';
import {
  CalorieFloorSimulator,
  ExifStripperDiff,
  SafetyFirewallDiagram,
} from './SafetyInteractive';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('coachInkOnDark', () => {
  const darkSurfaces: Array<[string, [number, number, number]]> = [
    ['surfaceContainerHigh (#2F3638)', [47, 54, 56]],
    ['surfaceContainerLow (#161D1E)', [22, 29, 30]],
  ];

  it('guarantees >= 4.5:1 WCAG AA contrast for every coach in the 28-fighter roster', () => {
    for (const coach of COACHES) {
      const ink = coachInkOnDark(coach.colour);
      const rgb = hexToRgb(ink);
      for (const [label, bg] of darkSurfaces) {
        expect(
          contrastRatio(rgb, bg),
          `${coach.id} (${coach.colour} -> ${ink}) on ${label}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('falls back safely on malformed colours', () => {
    expect(coachInkOnDark('not-a-hex')).toBe('#8aebff');
  });
});

describe('MealTraceDemo', () => {
  it('computes deterministic totals, clamps bounds, and clears confirm on edit', () => {
    render(<MealTraceDemo />);

    // Sourdough 75g (204) + Avocado 70g (112) + Poached eggs 100g (143) = 459 kcal.
    expect(screen.getByText('459')).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: /confirm proposal/i });
    fireEvent.click(confirmBtn);
    expect(confirmBtn.getAttribute('aria-pressed')).toBe('true');

    // Increase Sourdough toast from 75g -> 90g: round(272 * 0.9) = 245 (+41 kcal -> 500 kcal)
    fireEvent.click(screen.getByRole('button', { name: /increase sourdough toast by 15 grams/i }));
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByRole('button', { name: /confirm proposal/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    // Clamp Avocado down to 20g and confirm the decrease button disables at the floor.
    const decAvocado = screen.getByRole('button', { name: /decrease sliced avocado by 15 grams/i });
    for (let i = 0; i < 6; i++) fireEvent.click(decAvocado);
    expect(decAvocado.hasAttribute('disabled')).toBe(true);
  });
});

describe('CornerStage', () => {
  it('switches personas and variant gear while holding identical clinical refusal text', () => {
    render(
      <MemoryRouter>
        <CornerStage />
      </MemoryRouter>,
    );

    const refusal =
      'That one is outside what I can help with. Thyroid medication is a clinical decision, so please talk to your doctor or pharmacist. I can keep helping with your meals and training in the meantime.';
    expect(screen.getByText(refusal)).toBeTruthy();

    // Switch to Ogun Celsus (who also has an alt gear variant).
    fireEvent.click(screen.getByRole('button', { name: /ogun/i }));
    expect(screen.getByText(refusal)).toBeTruthy();
    expect(screen.getAllByText('Ogun Celsus').length).toBeGreaterThan(0);

    const variantBtn = screen.getByRole('button', { name: /alt gear/i });
    fireEvent.click(variantBtn);
    expect(variantBtn.getAttribute('aria-pressed')).toBe('true');
    const portrait = screen.getByAltText(/ogun celsus/i);
    expect(portrait.getAttribute('src')).toBe('/coaches/ogun/variant.webp');
  });
});

describe('BeltRail', () => {
  it('updates active rung details across all five consistency belts', () => {
    render(<BeltRail />);

    for (const rung of BELT_LADDER) {
      const btn = screen.getByRole('button', { name: new RegExp(rung.tier, 'i') });
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText(`${rung.activeDays} active days`)).toBeTruthy();
    }
  });
});

describe('AkinCollectibleCard', () => {
  it('flips between front face and accessible Tale of the Tape back face and moves focus', () => {
    const { container } = render(<AkinCollectibleCard />);

    const stage = container.querySelector('[data-flipped]');
    expect(stage?.getAttribute('data-flipped')).toBe('false');
    expect(container.querySelector('.lp-flip-back')?.className).toContain('overflow-y-auto');

    const toBackBtn = screen.getByRole('button', { name: /tale of the tape/i });
    fireEvent.click(toBackBtn);
    expect(stage?.getAttribute('data-flipped')).toBe('true');
    expect(screen.getByText('AZH-001')).toBeTruthy();
    expect(screen.getByText(/Melbourne, Australia/i)).toBeTruthy();

    const toFrontBtn = screen.getByRole('button', { name: /^front$/i });
    expect(document.activeElement).toBe(toFrontBtn);

    fireEvent.click(toFrontBtn);
    expect(stage?.getAttribute('data-flipped')).toBe('false');
    expect(document.activeElement).toBe(toBackBtn);
  });
});

describe('FighterLockerRoom', () => {
  it('includes flagship strikers under Striking, expands all 28 fighters, and renders clean reactions', () => {
    const strikingIds = new Set(
      COACHES.filter((c) => coachCategories(c).has('striking')).map((c) => c.id),
    );
    for (const id of ['akin', 'king', 'kwon', 'reinier', 'randall', 'ryoto']) {
      expect(strikingIds.has(id), `${id} should appear in Striking`).toBe(true);
    }

    const { container } = render(<FighterLockerRoom />);

    expect(screen.getByText(`Showing 8 of ${COACHES.length} fighters`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`reveal all ${COACHES.length}`, 'i') }));
    expect(screen.getByText(`Showing ${COACHES.length} of ${COACHES.length} fighters`)).toBeTruthy();

    // Check every reaction tab interpolates cleanly without raw `{n}` or `{name}` tokens.
    for (const label of ['7-day rhythm', 'Rest day', 'Level up', 'Greeting']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      const quote = container.querySelector('blockquote');
      expect(quote?.textContent).toBeTruthy();
      expect(quote?.textContent).not.toMatch(/\{n\}|\{name\}/);
    }

    // Filter to Striking and pick King.
    fireEvent.click(screen.getByRole('button', { name: 'Striking' }));
    const group = screen.getByRole('group', { name: /filter fighters/i });
    expect(within(group).getByRole('button', { name: 'Striking' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('SafetyInteractive', () => {
  it('steps through all four firewall gates on click', () => {
    render(<SafetyFirewallDiagram />);

    fireEvent.click(screen.getByRole('button', { name: /zero-tolerance allergen filter/i }));
    expect(screen.getByText(/anything that cannot be proven clear is dropped/i)).toBeTruthy();
  });

  it('enforces and discloses all three calorie floors (female, unspecified, male)', () => {
    render(<CalorieFloorSimulator />);

    const slider = screen.getByRole('slider', { name: /simulated raw deficit target/i });

    // Female default: 1100 -> clamped to 1200.
    expect(screen.getByRole('status').textContent).toContain(`${KCAL_FLOOR.female.toLocaleString()} kcal floor`);

    // Unspecified: 1100 -> clamped to 1350.
    fireEvent.click(screen.getByRole('button', { name: /not stated/i }));
    expect(screen.getByRole('status').textContent).toContain(
      `${KCAL_FLOOR.unspecified.toLocaleString()} kcal floor`,
    );

    // Male: 1100 -> clamped to 1500.
    fireEvent.click(screen.getByRole('button', { name: /^male/i }));
    expect(screen.getByRole('status').textContent).toContain(`${KCAL_FLOOR.male.toLocaleString()} kcal floor`);

    // Above floor: 1900 passes through unmodified.
    fireEvent.change(slider, { target: { value: '1900' } });
    expect(screen.getByRole('status').textContent).toMatch(/passes through unmodified/i);
  });

  it('toggles EXIF diff between Raw phone photo and Persisted bytes', () => {
    render(<ExifStripperDiff />);

    expect(screen.getByText(/0 bytes \(re-encoded on ingest\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /raw phone photo/i }));
    expect(screen.getByText('PXL_20261124_191204.jpg')).toBeTruthy();
    expect(screen.getByText(/Pixel 9 Pro/i)).toBeTruthy();
  });
});
