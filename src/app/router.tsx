import LandingPage from "../pages/LandingPage";
import CommunitiesPage from "../pages/CommunitiesPage";
import GetStartedPage from "../pages/GetStartedPage";
import RadioPage from "../pages/RadioPage";
import SpacePage from "../pages/SpacePage";

export function AppRouter() {
  if (window.location.pathname === "/communities") {
    return <CommunitiesPage />;
  }

  if (window.location.pathname === "/get-started") {
    return <GetStartedPage />;
  }

  if (window.location.pathname === "/space") {
    return <SpacePage />;
  }

  if (window.location.pathname === "/radio") {
    return <RadioPage />;
  }

  return <LandingPage />;
}
