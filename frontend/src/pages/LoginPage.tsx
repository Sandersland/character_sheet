import { useEffect, useState } from "react";

import { fetchAuthProviders } from "@/api/client";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { AuthProviderInfo } from "@/types/auth";

// Provider buttons are data-driven from GET /api/auth/providers. Each is a
// plain anchor (not an XHR) so the browser follows the full OAuth redirect
// chain back to the app.
type LoadState =
  | { status: "loading" }
  | { status: "ready"; providers: AuthProviderInfo[] }
  | { status: "error" };

export default function LoginPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const showSpinner = useDelayedFlag(state.status === "loading");

  useEffect(() => {
    let active = true;
    fetchAuthProviders()
      .then((providers) => active && setState({ status: "ready", providers }))
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center bg-parchment-100 p-4">
      <Card title="Sign in" className="w-full max-w-sm">
        <div className="flex flex-col gap-4 p-6">
          <h1 className="font-display text-2xl text-parchment-800">Character Sheet</h1>
          <p className="text-sm text-parchment-600">
            Sign in to manage your characters.
          </p>

          {state.status === "loading" && showSpinner && <Spinner />}

          {state.status === "error" && (
            <p className="text-sm text-garnet-700">
              Couldn't reach the server. Check that it's running and refresh.
            </p>
          )}

          {state.status === "ready" && state.providers.length === 0 && (
            <p className="text-sm text-parchment-600">
              No sign-in providers are configured. Set the provider credentials on
              the server and refresh.
            </p>
          )}

          {state.status === "ready" &&
            state.providers.map((provider) => (
              <a
                key={provider.id}
                href={provider.startUrl}
                className="rounded-control bg-garnet-surface px-4 py-2 text-center text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover focus-visible:bg-garnet-surface-hover"
              >
                Sign in with {provider.displayName}
              </a>
            ))}
        </div>
      </Card>
    </main>
  );
}
