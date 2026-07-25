import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { getQueryClient } from "@/api/queryClient";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import AppHeader from "@/features/auth/AppHeader";
import AuthGate from "@/features/auth/AuthGate";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import CampaignDetailPage from "@/features/campaign/CampaignDetailPage";
import CampaignsPage from "@/features/campaign/CampaignsPage";
import JoinCampaignRoute from "@/features/campaign/JoinCampaignRoute";
import EntityDetailPage from "@/features/entities/EntityDetailPage";
import AboutPage from "@/pages/AboutPage";
import CharacterListPage from "@/pages/CharacterListPage";
import CharacterSheetPage from "@/pages/CharacterSheetPage";

// Route-lazy the heavy non-initial surfaces: character creation, the journal,
// and the level-up ceremony.
const CharacterCreatePage = lazy(() => import("@/pages/CharacterCreatePage"));
const JournalPage = lazy(() => import("@/pages/JournalPage"));
const LevelUpPage = lazy(() => import("@/pages/LevelUpPage"));

// Dev-only: the guard is statically false in a production build, so Rollup drops
// the branch and the dynamic import with it — no devtools chunk is emitted.
// (A top-level `const X = lazy(() => import(...))` is reachable code and would
// ship the chunk into `dist` regardless of whether it is ever rendered — verified,
// see [C2 evidence #2] in the PR body.)
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
    )
  : null;

// #962: the live session now lives on the sheet's Combat tab (#960), so the old
// `/characters/:id/session` route redirects there. Kept for bookmarks / e2e; a
// param-aware component is needed since a plain <Navigate> can't read `:id`.
function LegacySessionRedirect() {
  const { id } = useParams();
  return <Navigate to={`/characters/${id}?tab=combat`} replace />;
}

export default function App() {
  return (
    // Outermost: injects the module-level client (@/api/queryClient) into React
    // context so useQuery/useQueryClient resolve anywhere in the tree. Server
    // state is orthogonal to routing/theme/auth, so it wraps rather than nests.
    <QueryClientProvider client={getQueryClient()}>
      <BrowserRouter>
        {/* Catches any render-time crash in a route so one bad screen can't
            blank the whole app mid-session. */}
        <ErrorBoundary>
          {/* Theme wraps everything so data-theme is applied app-wide. */}
          <ThemeProvider>
            {/* Dice-roll presentation preference (Animated vs Quick, #945). */}
            <DiceRollStyleProvider>
              {/* Auth wraps the route tree: AuthGate shows the login screen for an
                  anonymous user (incl. after a 401), the app otherwise. */}
              <AuthProvider>
                {/* Flex-column shell: header + routes share one dvh column (#1171). */}
                <div className="flex min-h-dvh flex-col">
                  <AuthGate>
                    <AppHeader />
                    <div className="flex min-h-0 flex-1 flex-col">
                      {/* Suspense catches the lazy route chunks while they load. */}
                      <Suspense fallback={null}>
                        <Routes>
                          <Route path="/" element={<CharacterListPage />} />
                          {/* Static path registered before the :id param route so "new"
                              can never be swallowed by it. */}
                          <Route path="/characters/new" element={<CharacterCreatePage />} />
                          <Route path="/characters/:id" element={<CharacterSheetPage />} />
                          {/* Field-chronicle journal page (#864) */}
                          <Route path="/characters/:id/journal" element={<JournalPage />} />
                          {/* Level-up ceremony (#886) */}
                          <Route path="/characters/:id/level-up" element={<LevelUpPage />} />
                          {/* Live-play now lives on the sheet's Combat tab (#960/#962);
                              the old session route redirects there. */}
                          <Route
                            path="/characters/:id/session"
                            element={<LegacySessionRedirect />}
                          />
                          {/* Shared campaigns (#246) */}
                          <Route path="/campaigns" element={<CampaignsPage />} />
                          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
                          {/* Codex tab (#367) — explicit route, not an optional :tab param,
                              so it can't swallow the /entities/:entityId path below. */}
                          <Route path="/campaigns/:id/codex" element={<CampaignDetailPage />} />
                          {/* Owner-only Manage tab (#379) — route access is guarded inside
                              the page, which redirects a non-owner back to Overview. */}
                          <Route path="/campaigns/:id/manage" element={<CampaignDetailPage />} />
                          {/* Entity registry detail + backlinks (#248) */}
                          <Route
                            path="/campaigns/:id/entities/:entityId"
                            element={<EntityDetailPage />}
                          />
                          <Route path="/join/:code" element={<JoinCampaignRoute />} />
                          {/* About / third-party asset credits (#566) */}
                          <Route path="/about" element={<AboutPage />} />
                        </Routes>
                      </Suspense>
                    </div>
                  </AuthGate>
                </div>
              </AuthProvider>
            </DiceRollStyleProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </BrowserRouter>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
