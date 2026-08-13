/**
 * First-run home — what `/` shows to a signed-in account that has no wellness
 * profile yet.
 *
 * The old flow put a four-step form between registration and the product, which
 * is the shape of first session that people do not come back from. Nothing here
 * asks for anything: the account is already inside the app, on the same shell
 * and bottom nav as everyone else, and the three entries below all work with no
 * profile at all. The one thing that genuinely cannot work — a daily target —
 * says so plainly instead of inventing a number.
 */
import { Link } from 'react-router-dom';
import { AppHeader } from '../../components/ui/AppHeader';
import { useMe } from '../../lib/queries';
import { TargetsNotSetCard } from './SetupPrompt';

/** Destinations that are fully functional before any biometrics exist. */
const OPEN_SURFACES = [
  {
    to: '/workouts',
    icon: 'fitness_center',
    title: 'Browse workouts',
    body: 'The full exercise library, with form cues and demo clips.',
  },
  {
    to: '/coach',
    icon: 'forum',
    title: 'Ask the coach',
    body: 'General wellness questions, answered in plain language.',
  },
  {
    to: '/progress/log-weight',
    icon: 'monitor_weight',
    title: 'Log your weight',
    body: 'Start the trend line today; it keeps every entry.',
  },
] as const;

export default function FirstRun() {
  const { data: user } = useMe();
  const firstName = user?.displayName?.split(' ')[0] ?? '';

  return (
    <div>
      <AppHeader />

      <main className="px-container-margin">
        <section className="mt-5 mb-5 reveal">
          <h1 className="font-heading font-semibold tracking-tight text-3xl text-on-surface leading-tight">
            Hey{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-on-surface-variant/80 mt-1.5 leading-relaxed">
            You are in — nothing to fill in first. Have a look around, and set your targets
            whenever you are ready.
          </p>
        </section>

        <section className="mb-6 reveal reveal-2" aria-label="Daily targets">
          <TargetsNotSetCard />
        </section>

        <section className="mb-8 reveal reveal-3" aria-label="Things you can do now">
          <h2 className="font-heading font-semibold uppercase tracking-[0.04em] text-lg text-on-surface mb-3">
            Start here
          </h2>
          <ul className="flex flex-col gap-3">
            {OPEN_SURFACES.map((surface) => (
              <li key={surface.to}>
                <Link
                  to={surface.to}
                  className="glass-card flex items-center gap-4 p-4 text-left transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-surface-container-high text-primary"
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined">{surface.icon}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading font-semibold uppercase tracking-wide text-on-surface">
                      {surface.title}
                    </span>
                    <span className="block text-xs text-on-surface-variant mt-0.5">
                      {surface.body}
                    </span>
                  </span>
                  <span
                    className="material-symbols-outlined ml-auto shrink-0 text-on-surface-variant"
                    aria-hidden="true"
                  >
                    chevron_right
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-[11px] text-on-surface-variant/40 uppercase tracking-widest mb-8">
          General wellness support only
        </p>
      </main>
    </div>
  );
}
