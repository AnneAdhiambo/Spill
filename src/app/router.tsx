import LandingPage from "../pages/LandingPage";
import CommunitiesPage from "../pages/CommunitiesPage";

export function AppRouter() {
  if (window.location.pathname === "/communities") {
    return <CommunitiesPage />;
  }

  return <LandingPage />;
}
