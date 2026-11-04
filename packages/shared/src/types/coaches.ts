/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

// ---------- coach personas, progression and Stars entitlements ----------

/**
 * Which coach a user has selected, and the bond accrued with each one.
 *
 * Bond is *carried*, not recomputed: total XP is derived from activity (see
 * `computeExperience`), but which coach was standing next to the user while
 * that XP was earned is a historical fact no amount of folding can recover.
 * So the selection records the XP total at the moment it was made, current
 * bond is `accrued[coach] + (totalXp − baselineXp)`, and switching coaches
 * flushes the open amount into `accrued`. Switching therefore never destroys a
 * bond, and never transfers one either.
 */
export interface CoachState {
  type: 'coachState';
  /** Document id - equals the userId, so the record is a natural singleton. */
  id: string;
  userId: string;
  activeCoachId: string;
  /** Total XP when `activeCoachId` was selected. */
  baselineXp: number;
  /** Settled bond per coach id, excluding the open amount for the active one. */
  accrued: Record<string, number>;
  /** Coach ids bought with Stars - permanent, and independent of level. */
  purchased: string[];
  /**
   * What the user has already been congratulated for. Reactions are one-shot:
   * a level-up the user has seen must not greet them again tomorrow, or the
   * coach reads as a broken toy rather than someone paying attention.
   * Acknowledged explicitly by the client after display, never by the read
   * itself - an unacknowledged reaction is one the user did not actually see.
   */
  seenLevel: number;
  seenRankId: string;
  seenAchievementIds: string[];
  /**
   * What the last `GET /coaches/progression` actually put on screen.
   *
   * The acknowledgement used to re-derive this from live activity at ack time,
   * which meant it marked a *different* set seen than the one displayed: any
   * achievement earned between the read and the acknowledgement - an offline
   * outbox draining while the celebration overlay is up is the ordinary case -
   * was recorded as delivered without ever being rendered, and the one that
   * genuinely was shown could be left unseen.
   *
   * Recording what was offered is not the same as consuming it: the read stays
   * idempotent, a retry overwrites this with an identical value, and nothing is
   * marked seen until the client explicitly acknowledges. Optional because
   * states persisted before this field existed must still deserialize.
   */
  pendingDelivery?: DeliveredReactions;
  selectedAt: string;
  updatedAt: string;
}

/** The reactions one card actually displayed, recorded so the ack can mark exactly those. */
export interface DeliveredReactions {
  /** Level announced by a headline, or null when the card had none. */
  level: number | null;
  /** Rank announced by a rank-up headline, or null. */
  rankId: string | null;
  /** Achievement ids the card rendered. */
  achievementIds: string[];
}

/** Append-only record of a Telegram Stars purchase (idempotent by charge id). */
export interface StarsPurchase {
  type: 'starsPurchase';
  id: string;
  userId: string;
  coachId: string;
  /** Price actually charged, in Stars (XTR). */
  stars: number;
  /** Telegram's charge id - the idempotency key for payment replay. */
  telegramPaymentChargeId: string;
  /** Provider-side id when Telegram supplies one. */
  providerPaymentChargeId: string | null;
  /** Our correlation id, echoed through the invoice payload. */
  invoicePayload: string;
  /**
   * Telegram user who paid. Optional because purchases recorded before this
   * field existed have none; a refund then falls back to the linked account.
   */
  telegramUserId?: number | null;
  createdAt: string;
}

/**
 * Append-only record that a Stars purchase was refunded.
 * The purchase row is left in place. Idempotent on the charge id.
 */
export interface StarsRefund {
  type: 'starsRefund';
  id: string;
  userId: string;
  coachId: string;
  stars: number;
  telegramPaymentChargeId: string;
  /** Telegram user id passed to refundStarPayment. */
  telegramUserId: number;
  reason: string;
  /** Admin account that requested the refund. */
  actorId: string;
  createdAt: string;
}

/**
 * Anchor for a Stars Premium subscription invoice.
 *
 * Kept after the first payment. Telegram reuses the same invoice payload on
 * every renewal, and that payload is how a later charge finds the account.
 */
export interface StarsSubscription {
  type: 'starsSubscription';
  id: string;
  userId: string;
  /** Stars charged for each period, copied from config when the invoice was created. */
  stars: number;
  payload: string;
  createdAt: string;
}

/**
 * One settled Stars subscription charge. Idempotent on Telegram's charge id.
 * A renewal is a new row with a new charge id and the same invoice payload.
 */
export interface StarsSubscriptionPayment {
  type: 'starsSubscriptionPayment';
  id: string;
  userId: string;
  stars: number;
  telegramPaymentChargeId: string;
  providerPaymentChargeId: string | null;
  invoicePayload: string;
  telegramUserId?: number | null;
  /** ISO instant from Telegram's subscription_expiration_date. The period end. */
  subscriptionExpirationDate: string;
  isRecurring: boolean;
  isFirstRecurring: boolean;
  createdAt: string;
}

/**
 * Append-only record that one subscription charge was refunded and the
 * subscription was cancelled. The payment row stays.
 */
export interface StarsSubscriptionRefund {
  type: 'starsSubscriptionRefund';
  id: string;
  userId: string;
  stars: number;
  telegramPaymentChargeId: string;
  invoicePayload: string;
  telegramUserId: number;
  reason: string;
  actorId: string;
  createdAt: string;
}

/** Why a coach is or is not currently available to a user. */
export type CoachLockReason = 'free' | 'level' | 'purchased' | 'locked';

export interface CoachEntitlement {
  coachId: string;
  unlocked: boolean;
  /** How it was unlocked, or `locked` with the requirement still outstanding. */
  reason: CoachLockReason;
  /** Level needed when `reason` is `locked`; 0 otherwise. */
  requiredLevel: number;
  /** Stars price while locked, or null when the coach is not purchasable. */
  starsPrice: number | null;
  /** XP earned alongside this coach. Drives bond levels. */
  bondXp: number;
  bondLevel: number;
}

/** One authored coach line, already interpolated and ready to render. */
export interface CoachReaction {
  coachId: string;
  kind: string;
  text: string;
  /** Art variant the UI should show with it. */
  expression: 'neutral' | 'celebrate' | 'encourage';
}

/** GET /coaches - the character-select payload. */
export interface CoachRosterResponse {
  activeCoachId: string;
  experience: import('../gamification').ExperienceStatus;
  entitlements: CoachEntitlement[];
  /** Whether Stars purchases can currently be completed on this deployment. */
  starsAvailable: boolean;
}

/** Progression block returned with the progress summary and on the dashboard. */
export interface ProgressionStatus {
  experience: import('../gamification').ExperienceStatus;
  activeCoachId: string;
  bondXp: number;
  bondLevel: number;
  /** Newest first; what the coach says about the user's current position. */
  reactions: CoachReaction[];
}

export const GROWTH_EVENT_NAMES = [
  'share_opened',
  'share_copied',
  'share_native',
  'share_telegram',
  'challenge_created',
  'challenge_joined',
  'challenge_shared',
  'invite_captured',
  /* Telegram-first landing conversion. The pair matters more than either
     number alone: telegram_cta_clicked without web_fallback_clicked is a
     healthy funnel, while a rising web_fallback_clicked is the corporate /
     Telegram-blocked segment showing up in the data instead of bouncing
     silently. `telegram_launch` closes the loop from the other side - it only
     fires inside the Mini App, so web CTA clicks over Mini App launches is the
     real cross-surface conversion rate. */
  'telegram_cta_clicked',
  'web_fallback_clicked',
  'telegram_launch',
  /* Retention funnel. Once-per-browser client gates keep these sparse; the
     server still accepts repeats so a cleared cache cannot permanently hide
     a completed step. */
  'onboarding_completed',
  'onboarding_skipped',
  'first_value_meal',
  'first_value_workout',
  'error_encountered',
  'page_abandoned',
  /* Fight Camp (AZF-P1 §7.1). Props carry state and kinds only, never a
     code, a name or a health figure. */
  'squad_corner_opened',
  'share_kit_opened',
  'share_story',
  'cheer_viewed',
  'fc_recap_viewed',
] as const;
export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[number];

export interface GrowthEvent {
  type: 'growthEvent';
  id: string;
  userId: string | null;
  name: GrowthEventName;
  /** Free-form context (share kind, challenge code, channel). */
  props: Record<string, string | number | boolean | null>;
  /** Attribution snapshot captured on the client at event time. */
  attribution: {
    ref: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    challengeCode: string | null;
  };
  createdAt: string;
}
