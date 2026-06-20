import { BrowserRouter, Route, Routes } from "react-router-dom";

import CharacterCreatePage from "@/pages/CharacterCreatePage";
import CharacterListPage from "@/pages/CharacterListPage";
import CharacterSheetPage from "@/pages/CharacterSheetPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CharacterListPage />} />
        {/* Static path registered before the :id param route so "new"
            can never be swallowed by it. */}
        <Route path="/characters/new" element={<CharacterCreatePage />} />
        <Route path="/characters/:id" element={<CharacterSheetPage />} />
      </Routes>
    </BrowserRouter>
  );
}
