/**
 * The Share Kit (AZF-P1 US-F1 to US-F3): preview an effort card in story,
 * feed or X size, then share, download or copy its link.
 *
 * Nothing is posted for anyone: every share is a preview first and a tap by
 * the person after (US-F1 AC4). What a card can show is fixed (effortCard.ts)
 * and the chips saying so are locked on. The first name is off by default,
 * and is the masked one the API serves, never a name the account did not
 * choose. In Telegram, a story uses the season's static art, because
 * Telegram fetches a story image from a public URL itself; the person's link
 * rides in the caption, which is cut to Telegram's 200 characters.
 *
 * A Telegram client with no native share sheet cannot save a page's image
 * either, so there the card says how to keep it instead of offering buttons
 * that would do nothing.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import {
  SHARE_FORMATS,
  storyArtPath,
  storyCaption,
  type SeasonAccentId,
  type ShareFormat,
} from '@aquazerofit/shared';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { effortCard, renderEffortCard, type EffortCardInput } from '@/lib/effortCard';
import { ToggleSwitch } from './ToggleSwitch';
import { useShareLink, useShareSummary } from '@/lib/fightCamp';
import { useFightCamp } from '@/lib/fightRecord';
import { trackGrowth } from '@/lib/growth';
import { telegramStartAppUrl } from '@/lib/telegramLink';
import { canShareToStory, isTMA, shareToStory } from '@/lib/telegram';

const FORMAT_LABEL: Record<ShareFormat, string> = { story: 'Story', feed: 'Feed', x: 'X' };
const LOCKED = ['No weight', 'No photos', 'No food'] as const;

export interface ShareKitSheetProps {
  open: boolean;
  onClose: () => void;
  /** The card, minus the link and name the sheet decides. Keep it referentially stable: a new object redraws the canvas. */
  card: Omit<EffortCardInput, 'link' | 'firstName'>;
  accentId: SeasonAccentId;
  /**
   * A link to print instead of the person's share link: a squad invite
   * carries the squad's own invite URL. `tgStartParam` opens the Mini App on it.
   */
  link?: { url: string; tgStartParam: string };
}

export function ShareKitSheet({ open, onClose, card, accentId, link: fixedLink }: ShareKitSheetProps) {
  const toast = useToast();
  const sizeName = useId();
  const nameLabel = useId();
  const [format, setFormat] = useState<ShareFormat>('story');
  const [showName, setShowName] = useState(false);
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [renderError, setRenderError] = useState(false);
  const firstName = useFightCamp().data?.shareKit?.firstName ?? null;
  const shareLink = useShareLink(card.kind, open && !fixedLink);
  const summary = useShareSummary(open).data;
  const link = fixedLink ?? shareLink.data ?? null;
  const unavailable = renderError || (!fixedLink && shareLink.isError);
  const saveByHand = isTMA() && typeof navigator.share !== 'function';

  useEffect(() => {
    if (open) void trackGrowth('share_kit_opened', { kind: card.kind });
  }, [open, card.kind]);

  // Keyed on the URL, not the link object: a caller's inline `link` must not redraw.
  const linkUrl = link?.url ?? null;
  const content = useMemo(
    () =>
      linkUrl
        ? effortCard({ ...card, link: linkUrl.replace(/^https?:\/\//, ''), firstName: showName ? firstName : null })
        : null,
    [card, linkUrl, showName, firstName],
  );

  useEffect(() => {
    // The previous card goes first, so nothing can share or save it once the
    // choice that made it has changed.
    setImage(null);
    setRenderError(false);
    if (!open || !content) return;
    let url: string | null = null;
    let cancelled = false;
    void renderEffortCard(content, format)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ url, blob });
      })
      .catch(() => {
        if (!cancelled) setRenderError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, content, format]);

  if (!open) return null;

  const fileName = `aquazerofit-${card.kind}-${format}.png`;
  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = fileName;
    a.click();
    void trackGrowth('share_copied', { kind: card.kind, format, channel: 'download' });
  };
  const share = async () => {
    if (!image || !content || !link) return;
    const file = new File([image.blob], fileName, { type: 'image/png' });
    const data = { files: [file], title: 'AquaZeroFit', text: `${content.alt} ${link.url}` };
    if (typeof navigator.canShare === 'function' && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        void trackGrowth('share_native', { kind: card.kind, format });
        return;
      } catch (err) {
        // Cancelled: nothing to do. Refused: the download below still works.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    download();
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      void trackGrowth('share_copied', { kind: card.kind, format });
      toast.success('Link copied.');
    } catch {
      toast.show(link.url);
    }
  };
  const story = () => {
    if (!link || !content) return;
    const tgLink = telegramStartAppUrl(link.tgStartParam).replace(/^https:\/\//, '');
    const mediaUrl = `${window.location.origin}${storyArtPath(card.kind, card.belt, accentId)}`;
    if (shareToStory(mediaUrl, storyCaption(content.alt, tgLink))) {
      void trackGrowth('share_story', { kind: card.kind });
    }
  };

  const size = SHARE_FORMATS[format];
  return (
    <BottomSheet open onClose={onClose} title="Share">
      <fieldset>
        <legend className="sr-only">Card size</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((f) => (
            <label
              key={f}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
                format === f ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'
              }`}
            >
              <input
                type="radio"
                name={sizeName}
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
                className="sr-only"
              />
              {FORMAT_LABEL[f]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex justify-center">
        {image && content ? (
          <img
            src={image.url}
            alt={content.alt}
            width={size.width}
            height={size.height}
            className="max-h-[46vh] w-auto rounded-2xl border border-outline-variant/40"
            style={{ aspectRatio: `${size.width} / ${size.height}` }}
          />
        ) : unavailable ? (
          <p role="alert" className="py-8 text-center text-sm text-on-surface text-pretty">
            Your card could not be made just now. Close this and try again.
          </p>
        ) : (
          <div role="status" aria-label="Card loading" className="w-1/2" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            <Skeleton className="h-full w-full" />
          </div>
        )}
      </div>
      {saveByHand && image && (
        <p className="mt-2 text-center text-xs text-on-surface-variant text-pretty">
          To keep the card, press and hold it, or take a screenshot.
        </p>
      )}

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Never on your card">
        {LOCKED.map((label) => (
          <li
            key={label}
            className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              lock
            </span>
            {label}
          </li>
        ))}
      </ul>

      {firstName && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p id={nameLabel} className="text-sm text-on-surface">
            Show my first name on the card
          </p>
          <ToggleSwitch checked={showName} onChange={setShowName} labelledBy={nameLabel} />
        </div>
      )}

      <div className="mt-5 space-y-3">
        {!saveByHand && (
          <PrimaryButton onClick={() => void share()} disabled={!image}>
            Share
          </PrimaryButton>
        )}
        {format === 'story' && canShareToStory() && (
          <SecondaryButton onClick={story} disabled={!link}>
            Share to Telegram story
          </SecondaryButton>
        )}
        <div className={saveByHand ? '' : 'grid grid-cols-2 gap-3'}>
          {!saveByHand && (
            <SecondaryButton onClick={download} disabled={!image}>
              Download
            </SecondaryButton>
          )}
          <SecondaryButton onClick={() => void copy()} disabled={!link}>
            Copy link
          </SecondaryButton>
        </div>
      </div>

      {summary && summary.joined > 0 && (
        <p className="mt-4 text-center text-sm tabular-nums text-on-surface-variant text-pretty">
          {summary.joined === 1 ? '1 person' : `${summary.joined} people`} joined from your cards.
          {summary.inYourSquad.length > 0 && ` Now in your squad: ${summary.inYourSquad.join(', ')}.`}
        </p>
      )}
    </BottomSheet>
  );
}
