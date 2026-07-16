import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

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

// Route-lazy the heavy non-initial surfaces: character creation and live-play
// session (the latter drags in the whole session/turn-tracking cluster).
const CharacterCreatePage = lazy(() => import("@/pages/CharacterCreatePage"));
const SessionPage = lazy(() => import("@/pages/SessionPage"));
const JournalPage = lazy(() => import("@/pages/JournalPage"));

export default function App() {
  return (
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
            <AuthGate>
              <AppHeader />
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
                {/* Session (live-play) mode — focused action-first UI */}
                <Route path="/characters/:id/session" element={<SessionPage />} />
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
            </AuthGate>
          </AuthProvider>
          </DiceRollStyleProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
