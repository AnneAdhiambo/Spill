import LandingPage from "../pages/LandingPage";
import CommunitiesPage from "../pages/CommunitiesPage";
import GetStartedPage from "../pages/GetStartedPage";

export function AppRouter() {
  if (window.location.pathname === "/communities") {
    return <CommunitiesPage />;
  }

  if (window.location.pathname === "/get-started") {
    return <GetStartedPage />;
  }

  return <LandingPage />;
}
