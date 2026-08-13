/**
 * Render-error boundary. Without one, a single component throw unmounts the
 * entire React tree — the user gets a blank page and only a manual reload
 * recovers (this is how a cache-shape bug once blanked the whole app from the
 * /workouts tab). The boundary contains the damage to the panel it wraps.
 *
 * Two placements (see App.tsx / AppLayout.tsx):
 * - inside AppLayout around <Outlet />, so the bottom nav survives and the
 *   user can simply switch tabs;
 * - around the whole route tree as a last resort for everything else.
 *
 * `resetKey` (the route pathname) remounts children after navigation, so
 * leaving a crashed screen recovers it without a reload.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../ui/ErrorState';

interface Props {
  children: ReactNode;
  /** When this changes (e.g. route pathname), a crashed boundary resets. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dev aid only — production surfaces the ErrorState below.
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="px-container-margin py-10 max-w-md mx-auto min-h-[60vh] flex flex-col justify-center">
          <ErrorState
            message="This screen hit an unexpected error. Your data is safe — try again, or switch to another tab."
            retry={() => this.setState({ error: null })}
          />
        </main>
      );
    }
    return this.props.children;
  }
}
