import type { PropsWithChildren } from "react";
// Add application providers when their features are introduced.
export function AppProviders({ children }: PropsWithChildren) {
  return <>{children}</>;
}
