import { Component, type ErrorInfo, type ReactNode } from "react";

import Card from "@/components/ui/Card";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional custom fallback. Receives a `reset` callback that clears the
   * caught error so the boundary re-attempts rendering its children.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions in its subtree so a single bad render can't
 * unmount the whole app and leave a blank white page — important for a
 * live-play tool used at the table. React error boundaries must be class
 * components (there is no hook equivalent), and we deliberately avoid adding
 * the `react-error-boundary` dependency for a primitive this small.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the crash for local debugging. Hook for future client-side
    // error reporting (e.g. Sentry) would go here.
    console.error("Uncaught render error:", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) return fallback(error, this.reset);
      // Friendly recovery screen. Uses existing design tokens only
      // (parchment surface, garnet primary action).
      return (
        <div className="flex min-h-screen items-center justify-center bg-parchment-100 p-4">
          <Card className="max-w-md p-6 text-center">
            <h1 className="font-display text-xl font-semibold text-garnet-800">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-parchment-600">
              An unexpected error interrupted this screen. Your saved data is
              safe — try reloading, or head back to your characters.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
              >
                Reload
              </button>
              <a
                href="/"
                className="rounded-control border border-parchment-300 px-4 py-2 text-sm font-semibold text-parchment-700 transition-colors hover:bg-parchment-200"
              >
                Back to characters
              </a>
            </div>
          </Card>
        </div>
      );
    }

    return children;
  }
}
