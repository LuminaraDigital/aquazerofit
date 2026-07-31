import { NavLink } from 'react-router-dom';
import { haptic } from '../../lib/telegram';

const ITEMS = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/nutrition', icon: 'restaurant', label: 'Nutrition', end: false },
  { to: '/workouts', icon: 'fitness_center', label: 'Workouts', end: false },
  { to: '/progress', icon: 'monitoring', label: 'Progress', end: false },
  { to: '/coach', icon: 'smart_toy', label: 'Coach', end: false },
];

/**
 * Fixed bottom navigation with glass blur, refined active indicator
 * (a soft aqua glow pill behind the icon, not a top bar), and tighter
 * vertical rhythm.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 inset-x-0 z-50"
    >
      <div
        className="mx-auto max-w-md flex justify-around items-stretch glass-blur border-t border-outline-variant/30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => haptic('selection')}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-2.5 pb-2 min-h-[54px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                isActive ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 h-7 w-12 rounded-full bg-primary/12"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined relative z-10 text-[24px] transition-all ${
                    isActive ? 'drop-shadow-[0_0_8px_rgba(138,235,255,0.6)]' : ''
                  }`}
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <span className="relative z-10 text-[11px] font-medium tracking-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}