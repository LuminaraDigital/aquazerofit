/**
 * "Join Fight Camp: Season N" (AZF-P1 US-A1).
 *
 * In a season's first 14 days it is the card's one primary action, because a
 * fresh start is when a commitment is most likely to stick. After that it
 * steps back to a quiet text button, so a user who joined late is still
 * welcome and nobody is pressed with a countdown. Once enrolled it is a
 * plain statement of fact, not a badge to chase.
 *
 * Enrolment is only a commitment marker: belts accrue either way, so nothing
 * here implies a user who has not joined is missing anything.
 */
import { useEffect, useRef } from 'react';
import type { FightCampStatus, Season } from '@aquazerofit/shared';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useEnrol } from '@/lib/fightCamp';

interface Props {
  enrolment: NonNullable<FightCampStatus['enrolment']>;
  season: Season;
}

export function EnrolAction({ enrolment, season }: Props) {
  const toast = useToast();
  const enrol = useEnrol();
  const confirmation = useRef<HTMLParagraphElement>(null);
  const joinedHere = useRef(false);
  const join = () => {
    joinedHere.current = true;
    enrol.mutate('dashboard', {
      onSuccess: () => toast.success(`You're in. Season ${season.number} starts with you.`),
      onError: () => toast.error('Could not join just now. Try again.'),
    });
  };
  // The button that had focus is gone once enrolled; hand focus to the line
  // that replaced it rather than dropping it to the page.
  useEffect(() => {
    if (enrolment.enrolled && joinedHere.current) confirmation.current?.focus();
  }, [enrolment.enrolled]);

  if (enrolment.enrolled) {
    return (
      <p
        ref={confirmation}
        tabIndex={-1}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-on-surface outline-none"
      >
        <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
          sports_mma
        </span>
        In Fight Camp for Season {season.number}
      </p>
    );
  }

  if (enrolment.prompt === 'primary') {
    return (
      <PrimaryButton className="mt-4" onClick={join} loading={enrol.isPending}>
        Join Fight Camp: Season {season.number}
      </PrimaryButton>
    );
  }

  return (
    <button
      type="button"
      onClick={join}
      disabled={enrol.isPending}
      className="mt-3 min-h-[44px] rounded-lg px-1 text-left text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
    >
      Join Fight Camp for Season {season.number}
    </button>
  );
}
