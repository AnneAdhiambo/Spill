import LandingPage from "../pages/LandingPage";
import CommunitiesPage from "../pages/CommunitiesPage";
import GetStartedPage from "../pages/GetStartedPage";
import RadioPage from "../pages/RadioPage";
import SpacePage from "../pages/SpacePage";
import { hasActiveIdentitySession } from "../features/identity/keys";

const protectedPaths = ["/communities", "/space", "/radio"];

export function AppRouter() {
  const path = window.location.pathname;

  // App pages need a signed-in session; everyone else goes to the login page.
  if (protectedPaths.includes(path) && !hasActiveIdentitySession()) {
    window.location.replace("/get-started");
    return null;
  }

  if (path === "/communities") {
    return <CommunitiesPage />;
  }

  if (path === "/get-started") {
    return <GetStartedPage />;
  }

  if (path === "/space") {
    return <SpacePage />;
  }

  if (path === "/radio") {
    return <RadioPage />;
  }

  return <LandingPage />;
}
