import LandingPage from "../pages/LandingPage";
import CommunitiesPage from "../pages/CommunitiesPage";
import RadioPage from "../pages/RadioPage";
import PostPage from "../pages/PostPage";
import FeedPage from "../pages/FeedPage";
import GetStartedPage from "../pages/GetStartedPage";
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

  if (window.location.pathname === "/post") {
    return <PostPage />;
  }

  if (window.location.pathname === "/feed") {
    return <FeedPage />;
  }

  return <LandingPage />;
}
