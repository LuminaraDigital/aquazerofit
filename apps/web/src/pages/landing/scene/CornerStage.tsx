/**
 * Interactive 3D Fighter Corner Stage for the homepage `#coach` section.
 *
 * Uses canonical `coachById` from `@aquazerofit/shared`, unified `FighterPedestal`,
 * WCAG AA `coachInkOnDark` accents, variant gear support for both Akin and Ogun,
 * and immutable clinical refusal text across every persona.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COACHES, coachById, defaultCoach, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { FighterPedestal } from './FighterPedestal';
import { coachInkOnDark } from './coachContrast';

const FEATURED_KEYS = ['akin', 'sanzo', 'king', 'fabio', 'kwon', 'ogun'] as const;

const FEATURED_COACHES = FEATURED_KEYS.map((key) => coachById(key)).filter(
  (c): c is NonNullable<typeof c> => Boolean(c),
);

export function CornerStage() {
  const [selectedKey, setSelectedKey] = useState<string>('akin');
  const [showVariant, setShowVariant] = useState(false);

  const coach = coachById(selectedKey) ?? defaultCoach();
  const coachInk = coachInkOnDark(coach.colour);

  const turns = [
    { from: 'user' as const, text: 'How am I tracking today?' },
    {
      from: 'coach' as const,
      text:
        coach.id === 'akin'
          ? "You have around 768 kcal left and you're 32 g short on protein. A Greek yoghurt with berries would close most of that gap without crowding dinner."
          : `${coach.reactions.greeting} Today: 768 kcal left and 32 g short on protein — a Greek yoghurt with berries closes most of that gap cleanly.`,
    },
    { from: 'user' as const, text: 'Should I take something for my thyroid?' },
    {
      from: 'coach' as const,
      text: 'That one is outside what I can help with. Thyroid medication is a clinical decision, so please talk to your doctor or pharmacist. I can keep helping with your meals and training in the meantime.',
      boundary: true,
    },
  ];

  return (
    <div className="space-y-4">
      {/* 6-Fighter quick switch bar (min 44px touch height, WCAG AA borders & ink) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preview fighter coach">
          {FEATURED_COACHES.map((item) => {
            const active = item.id === coach.id;
            const itemInk = coachInkOnDark(item.colour);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedKey(item.id);
                  setShowVariant(false);
                }}
                aria-pressed={active}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                  active
                    ? 'border-primary-fixed-dim bg-surface-container-highest text-on-surface'
                    : 'border-outline/75 bg-surface-container-low text-on-surface-variant hover:border-primary hover:text-on-surface'
                }`}
              >
                <img
                  src={item.art.avatar}
                  alt=""
                  width={26}
                  height={26}
                  loading="lazy"
                  decoding="async"
                  className="h-6 w-6 rounded-full bg-surface-container-lowest object-cover object-top"
                />
                <span>{item.name.split(' ')[0]}</span>
                <span
                  className="hidden text-[12px] uppercase tracking-[0.06em] sm:inline"
                  style={{ color: active ? itemInk : undefined }}
                >
                  {item.voice.word}
                </span>
              </button>
            );
          })}
        </div>

        <Link
          to="/aqua-coach#roster"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-primary transition-colors hover:text-on-surface"
        >
          All {COACHES.length} fighters
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>

      {/* Unified 3D Fighter Pedestal + Grounded Conversation Stage */}
      <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        <FighterPedestal
          coach={coach}
          showVariant={showVariant}
          onToggleVariant={coach.art.variant ? () => setShowVariant((v) => !v) : undefined}
          heightClass="h-[248px]"
          footer={
            <div>
              <p className="font-heading text-[20px] font-semibold leading-none text-on-surface">
                {coach.name}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-on-surface-variant">
                {coach.domain}
              </p>
            </div>
          }
        />

        {/* Grounded conversation & immutable boundary proof */}
        <div className="lp-panel flex h-full flex-col p-2">
          <div className="flex items-center gap-3 px-4 py-3">
            <img
              src={coach.art.avatar}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              className="h-11 w-11 rounded-full bg-surface-container-lowest object-cover object-top"
              style={{ border: `1.5px solid ${coachInk}` }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-on-surface">
                {coach.id === 'akin' ? 'Coach Akin' : coach.name}
              </p>
              <p className="text-[13px] text-on-surface-variant">
                Voice: <span className="text-on-surface">{coach.voice.word}</span> · Grounded in
                today&apos;s log
              </p>
            </div>
            <span className="text-[12px] font-medium text-outline">Illustrative</span>
          </div>

          <div className="flex-1 space-y-2.5 rounded-xl bg-surface p-4 sm:p-5">
            {turns.map((turn, i) => (
              <div
                key={`${coach.id}-${i}`}
                className={`flex ${turn.from === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-card px-4 py-3 text-[15px] leading-relaxed ${
                    turn.from === 'user'
                      ? 'bg-surface-container-highest text-on-surface'
                      : turn.boundary
                        ? 'border border-coral/40 bg-coral/[0.07] text-on-surface'
                        : 'bg-surface-container-high text-on-surface'
                  }`}
                >
                  {turn.boundary && (
                    <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-coral">
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        shield
                      </span>
                      Boundary held — identical for all {COACHES.length} coaches
                    </p>
                  )}
                  {turn.text}
                </div>
              </div>
            ))}
          </div>

          <p className="px-4 pb-2.5 pt-3 text-[13px] leading-relaxed text-on-surface-variant">
            {WELLNESS_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
