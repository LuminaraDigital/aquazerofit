/**
 * Interactive engineering proofs for `/safety`:
 *  1. SafetyFirewallDiagram — still, formal-audit 4-gate pipeline (no 3D tilt
 *     on safety documentation; click-driven, zero hover state hijacking).
 *  2. CalorieFloorSimulator — live slider supporting all three `KCAL_FLOOR`
 *     settings (female, male, unspecified) with accessible status disclosure.
 *  3. ExifStripperDiff — authentic Pixel 9 Pro `.jpg` raw-vs-persisted diff.
 */
import { useId, useState } from 'react';
import { KCAL_FLOOR } from '@aquazerofit/shared';

const GATES = [
  {
    code: 'GATE 01',
    name: 'Inbound Safety Classifier',
    status: 'Deterministic pattern screen',
    detail: 'Screens crisis, medical, and extreme-diet prompts before a single model token is spent.',
    tone: 'text-coral',
  },
  {
    code: 'GATE 02',
    name: 'Pure Calculation & Floor Clamp',
    status: `Floor: ${KCAL_FLOOR.female} / ${KCAL_FLOOR.unspecified} / ${KCAL_FLOOR.male} kcal`,
    detail: 'Targets and meal totals run strictly in TypeScript pure functions. Clamps are always disclosed.',
    tone: 'text-primary',
  },
  {
    code: 'GATE 03',
    name: 'Zero-Tolerance Allergen Filter',
    status: 'Post-generation code filter',
    detail: 'Tuned against false negatives: anything that cannot be proven clear is dropped before display.',
    tone: 'text-secondary',
  },
  {
    code: 'GATE 04',
    name: 'Outbound Numeric & Medical Scan',
    status: 'Second pass + audit log',
    detail: 'Scans generated prose for sub-floor prescriptions or clinical dosing before reaching your screen.',
    tone: 'text-primary',
  },
];

export function SafetyFirewallDiagram() {
  const [active, setActive] = useState(0);
  const current = GATES[active] ?? GATES[0]!;

  return (
    <div className="lp-panel p-5">
      <div className="flex items-center justify-between border-b border-outline-variant/50 pb-3">
        <span className="stat-label text-primary">Code-Enforced Pipeline</span>
        <span className="stat-label text-secondary">CI Eval Gated</span>
      </div>

      <ol className="mt-4 space-y-2">
        {GATES.map((gate, i) => {
          const selected = i === active;
          return (
            <li key={gate.code}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={selected}
                className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-primary-fixed-dim bg-surface-container-highest/70'
                    : 'border-outline/75 bg-surface hover:border-primary'
                }`}
              >
                <span className="min-w-0">
                  <span className={`block text-[12px] font-semibold uppercase tracking-[0.12em] ${gate.tone}`}>
                    {gate.code}
                  </span>
                  <span className="block font-heading text-[18px] font-semibold leading-tight text-on-surface">
                    {gate.name}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[12px] tabular-nums text-on-surface-variant sm:inline">
                  {gate.status}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-xl border border-outline-variant/60 bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-on-surface-variant">
        <span className="font-semibold text-on-surface">{current.name}:</span> {current.detail}
      </div>
    </div>
  );
}

type FloorKey = keyof typeof KCAL_FLOOR;

const FLOOR_OPTIONS: Array<{ key: FloorKey; label: string }> = [
  { key: 'female', label: `Female (${KCAL_FLOOR.female})` },
  { key: 'unspecified', label: `Not stated (${KCAL_FLOOR.unspecified})` },
  { key: 'male', label: `Male (${KCAL_FLOOR.male})` },
];

export function CalorieFloorSimulator() {
  const [profileSex, setProfileSex] = useState<FloorKey>('female');
  const [requested, setRequested] = useState(1100);
  const sliderId = useId();

  const floor = KCAL_FLOOR[profileSex];
  const clamped = requested < floor;
  const output = clamped ? floor : requested;

  return (
    <div className="lp-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="stat-label text-primary">Test the floor clamp</p>
        <div
          className="flex flex-wrap gap-1 rounded-xl border border-outline/75 bg-surface p-1"
          role="group"
          aria-label="Calorie floor profile"
        >
          {FLOOR_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setProfileSex(opt.key)}
              aria-pressed={profileSex === opt.key}
              className={`min-h-[38px] rounded-xl px-2.5 text-[12px] font-semibold transition-colors ${
                profileSex === opt.key
                  ? 'bg-surface-container-highest text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[13px]">
          <label htmlFor={sliderId} className="text-on-surface-variant">
            Simulated raw deficit target
          </label>
          <span className="font-semibold tabular-nums text-on-surface">
            {requested.toLocaleString()} kcal
          </span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={800}
          max={2200}
          step={25}
          value={requested}
          aria-valuetext={`${requested} kilocalories`}
          onChange={(e) => setRequested(Number(e.target.value))}
          className="mt-1 h-11 w-full cursor-pointer accent-primary"
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between rounded-xl border border-outline-variant/60 bg-surface px-4 py-3">
        <span className="stat-label">Output shown to user</span>
        <span
          className={`font-heading text-[34px] font-bold leading-none tabular-nums ${
            clamped ? 'text-coral' : 'text-secondary'
          }`}
        >
          {output.toLocaleString()} kcal
        </span>
      </div>

      <p
        role="status"
        className={`mt-3 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${
          clamped
            ? 'border-coral/40 bg-coral/[0.08] text-on-surface'
            : 'border-secondary/35 bg-secondary/[0.06] text-on-surface-variant'
        }`}
      >
        {clamped
          ? `Clamp engaged: raw ${requested.toLocaleString()} kcal was raised to the ${floor.toLocaleString()} kcal floor and disclosed explicitly on screen.`
          : `Above the ${floor.toLocaleString()} kcal floor — target passes through unmodified.`}
      </p>
    </div>
  );
}

export function ExifStripperDiff() {
  const [stage, setStage] = useState<'raw' | 'persisted'>('persisted');

  return (
    <div className="lp-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/50 pb-3">
        <span className="stat-label text-primary">Upload byte inspection</span>
        <div
          className="flex gap-1 rounded-xl border border-outline/75 bg-surface p-1"
          role="group"
          aria-label="Inspect upload stage"
        >
          <button
            type="button"
            onClick={() => setStage('raw')}
            aria-pressed={stage === 'raw'}
            className={`min-h-[38px] rounded-xl px-3 text-[12px] font-semibold transition-colors ${
              stage === 'raw'
                ? 'bg-coral/20 text-coral'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Raw phone photo
          </button>
          <button
            type="button"
            onClick={() => setStage('persisted')}
            aria-pressed={stage === 'persisted'}
            className={`min-h-[38px] rounded-xl px-3 text-[12px] font-semibold transition-colors ${
              stage === 'persisted'
                ? 'bg-secondary/20 text-secondary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Persisted bytes
          </button>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-outline-variant/50 font-mono text-[12.5px]">
        {stage === 'raw' ? (
          <>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">Filename</dt>
              <dd className="text-right text-coral">PXL_20261124_191204.jpg</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">EXIF GPS</dt>
              <dd className="text-right text-coral">37.8136° S, 144.9631° E</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">Device &amp; Lens</dt>
              <dd className="text-right text-coral">Pixel 9 Pro · Serial &amp; lens EXIF</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">Client MIME</dt>
              <dd className="text-right text-on-surface-variant">Untrusted header</dd>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">Storage key</dt>
              <dd className="text-right text-secondary">8f3c...a91e (private, opaque)</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">EXIF / XMP / IPTC</dt>
              <dd className="text-right text-secondary">0 bytes (re-encoded on ingest)</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">Decode check</dt>
              <dd className="text-right text-secondary">Verified image pixels</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-on-surface-variant">Retention TTL</dt>
              <dd className="text-right text-primary">Auto-swept ≤ 24h (0s on fail)</dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}
