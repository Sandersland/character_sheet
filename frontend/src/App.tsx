import { BrowserRouter, Route, Routes } from "react-router-dom";

import CharacterListPage from "./pages/CharacterListPage";
import CharacterSheetPage from "./pages/CharacterSheetPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CharacterListPage />} />
        <Route path="/characters/:id" element={<CharacterSheetPage />} />
      </Routes>
    </BrowserRouter>
  );
}
