import { AQUA_CHARACTER, type AkinPose } from '@aquazerofit/shared';

type MascotSize = 'sm' | 'md' | 'lg' | 'hero';
type MascotCrop = 'face' | 'bust' | 'full';

const SIZE: Record<MascotSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-20 w-16',
  hero: 'h-44 w-32 sm:h-56 sm:w-40',
};

const DEFAULT_CROP: Record<MascotSize, MascotCrop> = {
  sm: 'face',
  md: 'face',
  lg: 'bust',
  hero: 'full',
};

const CROP_CLASS: Record<MascotCrop, string> = {
  face: 'object-cover object-[center_12%]',
  bust: 'object-cover object-[center_18%]',
  full: 'object-contain object-bottom',
};

/** Intrinsic size of every pose file (public/akin-*.jpg). */
const POSE_W = 682;
const POSE_H = 1024;

function poseUrl(pose: AkinPose = 'idle'): string {
  return AQUA_CHARACTER.poses[pose].url;
}

/**
 * Static Akin frame. Prefer `AkinStage` when you want interactive pose motion.
 */
export function AquaMascot({
  size = 'md',
  crop,
  pose = 'idle',
  className = '',
  label = AQUA_CHARACTER.name,
  decorative = false,
  rounded = true,
}: {
  size?: MascotSize;
  crop?: MascotCrop;
  pose?: AkinPose;
  className?: string;
  label?: string;
  decorative?: boolean;
  rounded?: boolean;
}) {
  const frame = crop ?? DEFAULT_CROP[size];
  const round =
    rounded && frame !== 'full'
      ? 'rounded-full'
      : rounded
        ? 'rounded-2xl'
        : '';

  // Always a small badge beside a heading (sm/md/lg) or a decorative hero
  // ornament, never the LCP element — the landing hero uses AkinStage. Lazy is
  // therefore free: an in-viewport instance is still fetched immediately.
  return (
    <img
      src={poseUrl(pose)}
      alt={decorative ? '' : label}
      aria-hidden={decorative || undefined}
      width={POSE_W}
      height={POSE_H}
      loading="lazy"
      decoding="async"
      className={`${SIZE[size]} ${CROP_CLASS[frame]} ${round} bg-black/40 ${className}`}
      draggable={false}
    />
  );
}

export { poseUrl };
