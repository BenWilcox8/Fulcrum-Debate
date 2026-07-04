import { Route, Routes } from "react-router-dom";
import RootLayout from "./RootLayout";
import DashboardScreen from "./screens/DashboardScreen";
import BlockFileScreen from "./screens/BlockFileScreen";
import RoundsScreen from "./screens/RoundsScreen";

/**
 * The application's route table: the persistent RootLayout wraps every area,
 * and each area renders its placeholder screen into the layout's outlet.
 * Kept separate from the router provider so tests can mount it under a
 * MemoryRouter with a chosen initial entry.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<DashboardScreen />} />
        <Route path="blocks" element={<BlockFileScreen />} />
        <Route path="rounds" element={<RoundsScreen />} />
      </Route>
    </Routes>
  );
}
