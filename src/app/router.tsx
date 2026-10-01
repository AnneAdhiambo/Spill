import LandingPage from "../pages/LandingPage";
import CommunitiesPage from "../pages/CommunitiesPage";
import RadioPage from "../pages/RadioPage";
import SpacePage from "../pages/SpacePage";
import PostPage from "../pages/PostPage";
import FeedPage from "../pages/FeedPage";

export function AppRouter() {
  if (window.location.pathname === "/communities") {
    return <CommunitiesPage />;
  }

  if (window.location.pathname === "/space") {
    return <SpacePage />;
  }

  if (window.location.pathname === "/radio") {
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
