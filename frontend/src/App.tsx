import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { getQueryClient } from "@/api/queryClient";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import AppHeader from "@/features/auth/AppHeader";
import AuthGate from "@/features/auth/AuthGate";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { PreferencesProvider } from "@/features/preferences/PreferencesProvider";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import CampaignDetailPage from "@/features/campaign/CampaignDetailPage";
import CampaignsPage from "@/features/campaign/CampaignsPage";
import JoinCampaignRoute from "@/features/campaign/JoinCampaignRoute";
import EntityDetailPage from "@/features/entities/EntityDetailPage";
import AboutPage from "@/pages/AboutPage";
import CharacterListPage from "@/pages/CharacterListPage";

// Heavy pages are route-lazy; a page stays eager only when its bundle cost is smaller than the extra round trip (#1279).
const CharacterSheetPage = lazy(() => import("@/pages/CharacterSheetPage"));
const CharacterCreatePage = lazy(() => import("@/pages/CharacterCreatePage"));
const JournalPage = lazy(() => import("@/pages/JournalPage"));
const LevelUpPage = lazy(() => import("@/pages/LevelUpPage"));

// Dev-only: the guard is statically false in a production build, so Rollup
// drops the branch and the dynamic import with it — no devtools chunk is
// emitted. A top-level `const X = lazy(() => import(...))` would ship the
// chunk into `dist` regardless of whether it's rendered.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
    )
  : null;

// The live session lives on the sheet's Combat tab; this route redirects
// there for bookmarks/e2e. A param-aware component is needed since a plain
// <Navigate> can't read `:id`.
function LegacySessionRedirect() {
  const { id } = useParams();
  return <Navigate to={`/characters/${id}?tab=combat`} replace />;
}

export default function App() {
  return (
    // Outermost: injects the module-level client from getQueryClient() into
    // React context so useQuery/useQueryClient resolve anywhere in the tree.
    // Server state is orthogonal to routing/theme/auth, so it wraps rather
    // than nests.
    <QueryClientProvider client={getQueryClient()}>
      <BrowserRouter>
        
        <ErrorBoundary>
          {/* Auth wraps everything below it (incl. Theme/DiceRollStyle) so
              PreferencesProvider can read useAuth()'s user/status to reconcile
              the account-synced cs:pref:* values (#1178); AuthProvider itself
              renders no themed UI, so this nesting doesn't delay paint. */}
          <AuthProvider>
            <PreferencesProvider>
              
              <ThemeProvider>
                
                <DiceRollStyleProvider>
                  
                  <div className="flex min-h-dvh flex-col">
                    
                    <AuthGate>
                      <AppHeader />
                      <div className="flex min-h-0 flex-1 flex-col">
                        
                        <Suspense fallback={null}>
                          <Routes>
                            <Route path="/" element={<CharacterListPage />} />
                            {/* Static path registered before the :id param route so "new"
                                can never be swallowed by it. */}
                            <Route path="/characters/new" element={<CharacterCreatePage />} />
                            <Route path="/characters/:id" element={<CharacterSheetPage />} />
                            
                            <Route path="/characters/:id/journal" element={<JournalPage />} />
                            
                            <Route path="/characters/:id/level-up" element={<LevelUpPage />} />
                            
                            <Route
                              path="/characters/:id/session"
                              element={<LegacySessionRedirect />}
                            />
                            
                            <Route path="/campaigns" element={<CampaignsPage />} />
                            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
                            {/* Codex tab (#367) — explicit route, not an optional :tab param,
                                so it can't swallow the /entities/:entityId path below. */}
                            <Route path="/campaigns/:id/codex" element={<CampaignDetailPage />} />
                            {/* Owner-only Manage tab (#379) — route access is guarded inside
                                the page, which redirects a non-owner back to Overview. */}
                            <Route path="/campaigns/:id/manage" element={<CampaignDetailPage />} />
                            
                            <Route
                              path="/campaigns/:id/entities/:entityId"
                              element={<EntityDetailPage />}
                            />
                            <Route path="/join/:code" element={<JoinCampaignRoute />} />
                            
                            <Route path="/about" element={<AboutPage />} />
                          </Routes>
                        </Suspense>
                      </div>
                    </AuthGate>
                  </div>
                </DiceRollStyleProvider>
              </ThemeProvider>
            </PreferencesProvider>
          </AuthProvider>
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
