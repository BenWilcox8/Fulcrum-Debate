import { HashRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes";

/**
 * The application shell. A HashRouter drives client-side navigation, which
 * works under Tauri's file:// context (no server to resolve real paths) and
 * renders entirely offline with no network dependency.
 */
export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
