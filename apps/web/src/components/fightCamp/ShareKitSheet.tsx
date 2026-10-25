/**
 * The Share Kit (AZF-P1 US-F1 to US-F3): preview an effort card in story,
 * feed or X size, then share, download or copy its link.
 *
 * Nothing is posted for anyone: every share is a preview first and a tap by
 * the person after (US-F1 AC4). What a card can show is fixed (effortCard.ts)
 * and the chips saying so are locked on. The first name is off by default.
 * In Telegram, a story uses the season's static art, because Telegram fetches
 * a story image from a public URL itself; the person's link rides in the
 * caption, which is cut to Telegram's 200 characters.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { Switch } from '@/components/ui/fields';
import { effortCard, renderEffortCard, type EffortCardInput } from '@/lib/effortCard';
import { useShareLink } from '@/lib/fightCamp';
import { trackGrowth } from '@/lib/growth';
import { telegramStartAppUrl } from '@/lib/telegramLink';
import { canShareToStory, shareToStory } from '@/lib/telegram';

const FORMAT_LABEL: Record<ShareFormat, string> = { story: 'Story', feed: 'Feed', x: 'X' };
const LOCKED = ['No weight', 'No photos', 'No food'] as const;

export interface ShareKitSheetProps {
  open: boolean;
  onClose: () => void;
  /** The card, minus the link and name the sheet decides. */
  card: Omit<EffortCardInput, 'link' | 'firstName'>;
  accentId: SeasonAccentId;
  /** The person's first name, offered behind a switch that starts off. */
  firstName: string | null;
  /**
   * A link to print instead of the person's share link: a squad invite
   * carries the squad's own invite URL. `tgStartParam` opens the Mini App on it.
   */
  link?: { url: string; tgStartParam: string };
}

export function ShareKitSheet({ open, onClose, card, accentId, firstName, link: fixedLink }: ShareKitSheetProps) {
  const toast = useToast();
  const [format, setFormat] = useState<ShareFormat>('story');
  const [showName, setShowName] = useState(false);
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const shareLink = useShareLink(card.kind, open && !fixedLink);
  const link = fixedLink ?? shareLink.data ?? null;

  useEffect(() => {
    if (open) void trackGrowth('share_kit_opened', { kind: card.kind });
  }, [open, card.kind]);

  const content = useMemo(
    () =>
      link
        ? effortCard({ ...card, link: link.url.replace(/^https?:\/\//, ''), firstName: showName ? firstName : null })
        : null,
    [card, link, showName, firstName],
  );

  useEffect(() => {
    if (!open || !content) return;
    let url: string | null = null;
    let cancelled = false;
    void renderEffortCard(content, format)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ url, blob });
      })
      .catch(() => setImage(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, content, format]);

  if (!open) return null;

  const fileName = `aquazerofit-${card.kind}-${format}.png`;
  const share = async () => {
    if (!image || !content || !link) return;
    const file = new File([image.blob], fileName, { type: 'image/png' });
    const data = { files: [file], title: 'AquaZeroFit', text: `${content.alt} ${link.url}` };
    if (typeof navigator.canShare === 'function' && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        void trackGrowth('share_native', { kind: card.kind, format });
      } catch {
        // Cancelled: nothing to do.
      }
      return;
    }
    download();
  };
  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = fileName;
    a.click();
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
      <div role="tablist" aria-label="Card size" className="grid grid-cols-3 gap-2">
        {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={format === f}
            onClick={() => setFormat(f)}
            className={`min-h-[44px] rounded-xl text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              format === f ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'
            }`}
          >
            {FORMAT_LABEL[f]}
          </button>
        ))}
      </div>

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
        ) : (
          <div aria-busy="true" aria-label="Card loading" className="w-1/2" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            <Skeleton className="h-full w-full" />
          </div>
        )}
      </div>

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
          <p className="text-sm text-on-surface">Show my first name</p>
          <Switch checked={showName} onChange={setShowName} label="Show my first name on the card" />
        </div>
      )}

      <div className="mt-5 space-y-3">
        <PrimaryButton onClick={() => void share()} disabled={!image}>
          Share
        </PrimaryButton>
        {format === 'story' && canShareToStory() && (
          <SecondaryButton onClick={story} disabled={!link}>
            Share to Telegram story
          </SecondaryButton>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SecondaryButton onClick={download} disabled={!image}>
            Download
          </SecondaryButton>
          <SecondaryButton onClick={() => void copy()} disabled={!link}>
            Copy link
          </SecondaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}
