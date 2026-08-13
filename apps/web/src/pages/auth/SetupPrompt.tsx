/**
 * The honest "we do not have your numbers yet" state.
 *
 * Calorie and macro targets come out of the deterministic target calculator
 * (Mifflin-St Jeor -> activity factor -> goal adjustment, clamped to the safety
 * floor). There is no defensible stand-in for that: printing a generic 2,000
 * kcal under the words "your target" would be a health claim about a person we
 * know nothing about. So any surface that would otherwise render a target
 * renders this instead — it names what is missing, why it is needed, and how
 * long it takes to supply.
 */
import { Link, useLocation } from 'react-router-dom';
import { AppHeader } from '../../components/ui/AppHeader';
import { GlassCard } from '../../components/ui/GlassCard';

/** Deep-link to the essentials form that returns the user to where they were. */
export function setupHref(returnTo?: string): string {
  return returnTo && returnTo !== '/' ? `/setup?next=${encodeURIComponent(returnTo)}` : '/setup';
}

/**
 * Card form — sits inside an otherwise working screen (the first-run home),
 * where the rest of the page is still useful without a profile.
 */
export function TargetsNotSetCard({ returnTo }: { returnTo?: string }) {
  return (
    <GlassCard className="p-card-padding">
      <div className="flex items-start gap-3">
        <span
          className="material-symbols-outlined text-primary shrink-0 mt-0.5"
          aria-hidden="true"
        >
          calculate
        </span>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface">
            Daily targets
          </h2>
          <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
            Not set up yet. We work your calories, macros and water out from your height,
            weight, age and how active you are — we never guess them, so there is nothing to
            show until you tell us.
          </p>
        </div>
      </div>
      <Link
        to={setupHref(returnTo)}
        className="cta-gradient mt-4 w-full min-h-[52px] rounded-2xl font-heading font-semibold uppercase tracking-[0.04em] text-sm text-[#001f25] transition-all active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary flex items-center justify-center gap-2 px-6"
      >
        Set up my targets
      </Link>
      <p className="text-xs text-on-surface-variant/70 text-center mt-2">
        Five questions, about thirty seconds.
      </p>
    </GlassCard>
  );
}

/**
 * Full-screen form — stands in for a surface whose whole purpose is comparing
 * logs against a target (nutrition, progress). Rendered inside the app shell so
 * the bottom nav survives: this is a missing prerequisite, not a dead end.
 */
export function TargetsNotSetScreen({ title, back = false }: { title: string; back?: boolean }) {
  const location = useLocation();
  return (
    <div>
      <AppHeader title={title} back={back} />
      <main className="px-container-margin pt-6 pb-8">
        <TargetsNotSetCard returnTo={`${location.pathname}${location.search}`} />
        <p className="text-xs text-on-surface-variant/60 text-center mt-6 leading-relaxed">
          Everything you log is kept — it just has nothing to be measured against yet.
        </p>
      </main>
    </div>
  );
}
