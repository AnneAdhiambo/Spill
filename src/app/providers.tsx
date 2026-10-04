import type { PropsWithChildren } from "react";
import { OfflineProvider } from "../features/offline/OfflineProvider";

// Add application providers when their features are introduced.
export function AppProviders({ children }: PropsWithChildren) {
  return <OfflineProvider>{children}</OfflineProvider>;
}
