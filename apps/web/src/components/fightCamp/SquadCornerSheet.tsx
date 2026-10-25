/**
 * Squad Corner (AZF-P1 US-C3): opened from a Telegram group, offer that
 * group's squad.
 *
 * Asked once per Mini App session and only where it can apply: inside
 * Telegram, launched from a group, for an adult with squads on. The client
 * decides only whether to ask; the server verifies the signed launch data,
 * finds the group by its hash, and answers what to offer. Nothing is sent to
 * the group: people share the invite themselves.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SQUAD_CONSENT_TEXT, type SquadCornerView } from '@aquazerofit/shared';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { useFightCamp } from '@/lib/fightRecord';
import { squadErrorMessage, useSquadCorner } from '@/lib/fightCamp';
import { trackGrowth } from '@/lib/growth';
import { getTelegramInitData, isTMA, launchedFromGroup } from '@/lib/telegram';

const ASKED_KEY = 'azf_squad_corner_asked';

function askedThisSession(): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

function markAsked(): void {
  try {
    sessionStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Private mode: the sheet may be offered again next launch, which is fine.
  }
}

export function SquadCornerSheet() {
  const navigate = useNavigate();
  const available = Boolean(useFightCamp().data?.squads);
  const corner = useSquadCorner();
  const [view, setView] = useState<SquadCornerView | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);
  const initData = getTelegramInitData();

  useEffect(() => {
    if (asked.current || !available || !initData || !isTMA() || !launchedFromGroup() || askedThisSession()) return;
    asked.current = true;
    markAsked();
    corner.mutate(
      { action: 'peek', tgInitData: initData },
      {
        onSuccess: (answer) => {
          if (!answer) return;
          void trackGrowth('squad_corner_opened', { state: answer.state });
          if (answer.state === 'none' || answer.state === 'joinable') setView(answer);
        },
      },
    );
  }, [available, initData, corner]);

  if (!view || !initData) return null;
  const close = () => setView(null);
  const act = (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    const input =
      view.state === 'none'
        ? ({ action: 'create', tgInitData: initData, name: name.trim(), consent: true } as const)
        : ({ action: 'join', tgInitData: initData, consent: true } as const);
    corner.mutate(input, {
      onSuccess: () => {
        close();
        navigate('/squad');
      },
      onError: (e) => setError(squadErrorMessage(e, 'That did not work. Try again.')),
    });
  };

  const starting = view.state === 'none';
  return (
    <BottomSheet
      open
      onClose={close}
      title={starting ? "Start this group's Squad Corner" : `Join ${view.squad?.name ?? 'this squad'}`}
    >
      <form onSubmit={act} className="space-y-4">
        {starting ? (
          <>
            <p className="text-sm leading-relaxed text-on-surface-variant text-pretty">
              A squad for up to five people from this group. AquaZeroFit never reads the group or
              posts in it: invite people yourself.
            </p>
            <label className="block text-sm font-semibold text-on-surface" htmlFor="corner-name">
              Squad name
            </label>
            <input
              id="corner-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              maxLength={32}
              required
              autoComplete="off"
              className="min-h-[44px] w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </>
        ) : (
          <p className="text-sm tabular-nums text-on-surface-variant">
            {view.squad?.memberCount} of 5 members · {view.squad?.seasonName}
          </p>
        )}
        <p className="text-base leading-relaxed text-on-surface text-pretty">{SQUAD_CONSENT_TEXT}</p>
        {error && (
          <p role="alert" className="text-sm text-on-surface">
            {error}
          </p>
        )}
        <PrimaryButton type="submit" loading={corner.isPending} disabled={starting && name.trim().length < 3}>
          {starting ? 'Agree and start' : 'Agree and join'}
        </PrimaryButton>
        <SecondaryButton onClick={close}>Not now</SecondaryButton>
      </form>
    </BottomSheet>
  );
}
