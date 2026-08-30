/**
 * Post-action share sheet: renders a branded Aqua card and offers native share,
 * Telegram share, and clipboard copy. This is the product-as-ad loop.
 */
import { useEffect, useState } from 'react';
import { AQUA_CHARACTER } from '@aquazerofit/shared';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { AquaMascot } from '@/components/brand/AquaMascot';
import { useToast } from '@/components/ui/Toast';
import {
  blobToObjectUrl,
  renderShareCard,
  SHARE_CARD_H,
  SHARE_CARD_W,
  type ShareCardPayload,
} from '@/lib/shareCard';
import { buildShareUrl, getAttribution, inviteRefFromUserId } from '@/lib/attribution';
import { trackGrowth } from '@/lib/growth';
import { haptic, openTelegramLink } from '@/lib/telegram';

export interface ShareMomentProps {
  open: boolean;
  onClose: () => void;
  payload: ShareCardPayload | null;
  /** Path appended to origin for invite links (default: /welcome). */
  invitePath?: string;
  userId?: string | null;
  challengeCode?: string | null;
}

export function ShareMoment({
  open,
  onClose,
  payload,
  invitePath = '/welcome',
  userId = null,
  challengeCode = null,
}: ShareMomentProps) {
  const toast = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !payload) return;
    let revoked: string | null = null;
    let cancelled = false;
    setBusy(true);
    void trackGrowth('share_opened', { kind: payload.kind });
    void renderShareCard(payload)
      .then(async (b) => {
        if (cancelled) return;
        setBlob(b);
        const url = await blobToObjectUrl(b);
        revoked = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not build the share card');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, payload, toast]);

  const shareUrl = (): string => {
    const attr = getAttribution();
    return buildShareUrl(invitePath, {
      ref: userId ? inviteRefFromUserId(userId) : attr.ref,
      challenge: challengeCode ?? attr.challengeCode,
      utm_source: 'share_card',
      utm_medium: payload?.kind ?? 'app',
      utm_campaign: 'aqua_viral',
    });
  };

  const shareText = (): string => {
    if (!payload) return AQUA_CHARACTER.tagline;
    return `${payload.headline} · ${payload.subline}\n${AQUA_CHARACTER.catchphrases[0]}\n${shareUrl()}`;
  };

  const onNativeShare = async () => {
    if (!payload) return;
    const url = shareUrl();
    const text = shareText();
    try {
      if (blob && typeof navigator !== 'undefined' && navigator.share) {
        const file = new File([blob], `aquazerofit-${payload.kind}.png`, { type: 'image/png' });
        const data: ShareData = { title: 'AquaZeroFit', text, url };
        if (navigator.canShare?.({ files: [file] })) {
          data.files = [file];
        }
        await navigator.share(data);
        haptic('success');
        void trackGrowth('share_native', { kind: payload.kind });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Share text copied');
      void trackGrowth('share_copied', { kind: payload.kind, channel: 'clipboard_fallback' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error('Share cancelled or unavailable');
    }
  };

  const onTelegram = () => {
    if (!payload) return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(shareText())}`;
    openTelegramLink(url);
    haptic('medium');
    void trackGrowth('share_telegram', { kind: payload.kind });
  };

  const onCopy = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(shareText());
      toast.success('Copied invite link');
      void trackGrowth('share_copied', { kind: payload.kind });
    } catch {
      toast.error('Could not copy');
    }
  };

  const onDownload = () => {
    if (!blob || !payload) return;
    const a = document.createElement('a');
    a.href = previewUrl ?? URL.createObjectURL(blob);
    a.download = `aquazerofit-${payload.kind}.png`;
    a.click();
    void trackGrowth('share_copied', { kind: payload.kind, channel: 'download' });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Share this win">
      <div className="space-y-4 pb-2">
          <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
          <AquaMascot size="md" crop="face" decorative />
          <div>
            <p className="text-sm font-semibold text-on-surface">{AQUA_CHARACTER.name} says</p>
            <p className="text-xs text-on-surface-variant">
              {payload?.catchphrase ?? AQUA_CHARACTER.catchphrases[0]}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-high/40">
          {busy || !previewUrl ? (
            <div className="flex h-64 items-center justify-center text-sm text-on-surface-variant">
              Building your card…
            </div>
          ) : (
            // Already decoded in memory (a blob: URL from the canvas) and the
            // reason the sheet was opened, so it is never deferred.
            <img
              src={previewUrl}
              alt="Share preview"
              width={SHARE_CARD_W}
              height={SHARE_CARD_H}
              loading="eager"
              decoding="async"
              className="block h-auto w-full object-cover"
            />
          )}
        </div>

        <div className="grid gap-2">
          <PrimaryButton onClick={() => void onNativeShare()} disabled={busy}>
            Share
          </PrimaryButton>
          <SecondaryButton onClick={onTelegram} disabled={busy}>
            Share on Telegram
          </SecondaryButton>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={() => void onCopy()} disabled={busy}>
              Copy link
            </SecondaryButton>
            <SecondaryButton onClick={onDownload} disabled={busy || !blob}>
              Save image
            </SecondaryButton>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="py-2 text-sm text-on-surface-variant underline-offset-2 hover:underline"
          >
            Not now
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
