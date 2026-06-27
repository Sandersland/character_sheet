import { BrowserRouter, Route, Routes } from "react-router-dom";

import ErrorBoundary from "@/components/ui/ErrorBoundary";
import CharacterCreatePage from "@/pages/CharacterCreatePage";
import CharacterListPage from "@/pages/CharacterListPage";
import CharacterSheetPage from "@/pages/CharacterSheetPage";
import SessionPage from "@/pages/SessionPage";

export default function App() {
  return (
    <BrowserRouter>
      {/* Catches any render-time crash in a route so one bad screen can't
          blank the whole app mid-session. */}
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<CharacterListPage />} />
          {/* Static path registered before the :id param route so "new"
              can never be swallowed by it. */}
          <Route path="/characters/new" element={<CharacterCreatePage />} />
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
          {/* Session (live-play) mode — focused action-first UI */}
          <Route path="/characters/:id/session" element={<SessionPage />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
