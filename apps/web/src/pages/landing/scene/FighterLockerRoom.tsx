/**
 * Interactive 28-Fighter Locker Room & Reaction Previewer for `/aqua-coach`.
 *
 * Uses multi-tag discipline/domain classification so flagship strikers (Akin,
 * King, Kwon, Reinier, Randall, Ryusei) always appear under Striking as well as
 * their conditioning/strength specialties, reuses canonical `renderReaction` &
 * `coachById` from `@aquazerofit/shared`, and renders the spotlight through
 * `FighterPedestal`.
 */
import { useMemo, useState } from 'react';
import {
  COACHES,
  coachById,
  defaultCoach,
  renderReaction,
  type CoachEventKind,
  type CoachPersona,
} from '@aquazerofit/shared';
import { FighterPedestal } from './FighterPedestal';
import { HoloFighterCard } from './HoloFighterCard';
import { coachInkOnDark } from './coachContrast';

export type FighterCategory = 'all' | 'striking' | 'grappling' | 'strength' | 'conditioning';

const CATEGORIES: Array<{ key: FighterCategory; label: string }> = [
  { key: 'all', label: `All ${COACHES.length}` },
  { key: 'striking', label: 'Striking' },
  { key: 'grappling', label: 'Grappling' },
  { key: 'strength', label: 'Strength' },
  { key: 'conditioning', label: 'Conditioning' },
];

const REACTION_TABS: Array<{ key: CoachEventKind; label: string }> = [
  { key: 'greeting', label: 'Greeting' },
  { key: 'steady', label: '7-day rhythm' },
  { key: 'restDay', label: 'Rest day' },
  { key: 'levelUp', label: 'Level up' },
];

/** Multi-tag discipline + domain classifier so hybrid fighters never vanish from their art. */
export function coachCategories(coach: CoachPersona): ReadonlySet<Exclude<FighterCategory, 'all'>> {
  const discipline = coach.discipline.toLowerCase();
  const domain = coach.domain.toLowerCase();
  const tags = new Set<Exclude<FighterCategory, 'all'>>();

  if (
    /muay thai|lethwei|taekwondo|kickboxing|karate|boxing|sanda|wushu|kendo|draka|pankration|bareknuckle|capoeira|complete mma/.test(
      discipline,
    )
  ) {
    tags.add('striking');
  }
  if (
    /sumo|grappling|jiu-jitsu|bjj|judo|wrestling|greco-roman|lucha libre|sambo|shooto|complete mma/.test(
      discipline,
    )
  ) {
    tags.add('grappling');
  }
  if (
    /powerlifting|heavyweight|strength|compound|isometric|bodyweight basics|grip strength/.test(
      `${discipline} ${domain}`,
    )
  ) {
    tags.add('strength');
  }
  if (/cardio|conditioning|aerobic|stamina|metabolic|endurance|mobility|agility/.test(domain)) {
    tags.add('conditioning');
  }

  if (tags.size === 0) tags.add('striking');
  return tags;
}

export function FighterLockerRoom() {
  const [category, setCategory] = useState<FighterCategory>('all');
  const [selectedId, setSelectedId] = useState<string>(defaultCoach().id);
  const [showVariant, setShowVariant] = useState(false);
  const [reactionKey, setReactionKey] = useState<CoachEventKind>('greeting');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(
    () =>
      category === 'all' ? COACHES : COACHES.filter((c) => coachCategories(c).has(category)),
    [category],
  );

  const selected = useMemo(
    () => coachById(selectedId) ?? defaultCoach(),
    [selectedId],
  );

  const visibleGrid = expanded || category !== 'all' ? filtered : filtered.slice(0, 8);
  const selectedInk = coachInkOnDark(selected.colour);

  return (
    <div className="space-y-8">
      {/* Selected Fighter Spotlight Panel */}
      <div className="lp-panel p-5 sm:p-7">
        <div className="grid items-center gap-8 lg:grid-cols-[290px_minmax(0,1fr)]">
          <FighterPedestal
            coach={selected}
            showVariant={showVariant}
            onToggleVariant={selected.art.variant ? () => setShowVariant((v) => !v) : undefined}
            heightClass="h-[272px]"
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span
                className="font-heading text-[14px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: selectedInk }}
              >
                {selected.ringName}
              </span>
              <span className="text-outline" aria-hidden="true">
                ·
              </span>
              <span className="text-on-surface">Voice: {selected.voice.word}</span>
              <span className="text-outline" aria-hidden="true">
                ·
              </span>
              <span className="text-secondary">
                {selected.unlock.kind === 'free'
                  ? 'Unlocked from day one'
                  : `${selected.unlock.label} (no paywall)`}
              </span>
            </div>

            <h3 className="mt-2 font-heading text-[36px] font-semibold leading-none text-on-surface sm:text-[44px]">
              {selected.name}
            </h3>
            <p className="mt-2 text-[15px] text-on-surface-variant">{selected.discipline}</p>

            <dl className="mt-5 grid gap-4 border-y border-outline-variant/60 py-4 sm:grid-cols-2">
              <div>
                <dt className="stat-label">Training domain</dt>
                <dd className="mt-1 text-[15px] font-semibold text-on-surface">{selected.domain}</dd>
              </div>
              <div>
                <dt className="stat-label">Signature philosophy</dt>
                <dd className="mt-1 text-[15px] text-on-surface">“{selected.tagline}”</dd>
              </div>
            </dl>

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="stat-label">Authored voice line</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reaction event">
                  {REACTION_TABS.map((tab) => {
                    const active = tab.key === reactionKey;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setReactionKey(tab.key)}
                        aria-pressed={active}
                        className={`min-h-[44px] rounded-xl px-3 text-[13px] font-semibold transition-colors sm:min-h-[36px] ${
                          active
                            ? 'bg-primary-fixed-dim azf-cta-text'
                            : 'border border-outline/75 bg-surface text-on-surface-variant hover:border-primary hover:text-on-surface'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <blockquote
                className="mt-3 rounded-xl border border-outline-variant/60 bg-surface p-4 text-[15.5px] leading-relaxed text-on-surface"
                style={{ borderLeftWidth: 3, borderLeftColor: selectedInk }}
              >
                “{renderReaction(selected.reactions[reactionKey], { n: 6, name: 'Purple Belt' })}”
              </blockquote>
            </div>
          </div>
        </div>
      </div>

      {/* Category filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter fighters by discipline">
          {CATEGORIES.map((item) => {
            const active = item.key === category;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setCategory(item.key)}
                aria-pressed={active}
                className={`min-h-[44px] rounded-full px-4 text-[14px] font-semibold transition-colors ${
                  active
                    ? 'bg-primary-fixed-dim azf-cta-text'
                    : 'border border-outline/75 bg-surface-container-low text-on-surface-variant hover:border-primary hover:text-on-surface'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] tabular-nums text-on-surface-variant">
          Showing {visibleGrid.length} of {filtered.length} fighters
        </p>
      </div>

      {/* Multi-plane 3D Fighter Deck */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {visibleGrid.map((coach) => (
          <HoloFighterCard
            key={coach.id}
            coach={coach}
            selected={coach.id === selected.id}
            eager={expanded || category !== 'all'}
            onSelect={(picked) => {
              setSelectedId(picked.id);
              setShowVariant(false);
            }}
          />
        ))}
      </div>

      {category === 'all' && filtered.length > 8 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-outline/80 bg-surface-container-low px-6 text-[14.5px] font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary"
          >
            {expanded
              ? 'Show top 8 fighters'
              : `Reveal all ${filtered.length} AZX fighters`}
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
