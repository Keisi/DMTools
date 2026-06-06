import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import Login from "./routes/Login";
import Vault from "./routes/Vault";
import CharacterSheet from "./routes/CharacterSheet";
import CharacterBuilder from "./routes/CharacterBuilder";
import Compendium from "./routes/Compendium";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/vault" replace />} />
        <Route
          path="/vault"
          element={
            <RequireAuth>
              <Vault />
            </RequireAuth>
          }
        />
        <Route
          path="/character/new"
          element={
            <RequireAuth>
              <CharacterBuilder />
            </RequireAuth>
          }
        />
        <Route
          path="/character/:id"
          element={
            <RequireAuth>
              <CharacterSheet />
            </RequireAuth>
          }
        />
        <Route
          path="/compendium"
          element={
            <RequireAuth>
              <Compendium />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/vault" replace />} />
      </Route>
    </Routes>
  );
}
