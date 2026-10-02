import { useCallback, useEffect, useState } from "react";
import {
  endIdentitySession,
  hasActiveIdentitySession,
  identitySessionEvent,
} from "../features/identity/keys";

export function useIdentitySession() {
  const [isSignedIn, setIsSignedIn] = useState(hasActiveIdentitySession);

  useEffect(() => {
    const syncSession = () => setIsSignedIn(hasActiveIdentitySession());
    window.addEventListener(identitySessionEvent, syncSession);
    window.addEventListener("storage", syncSession);

    return () => {
      window.removeEventListener(identitySessionEvent, syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  const signOut = useCallback(() => {
    endIdentitySession();
    setIsSignedIn(false);
    window.location.pathname = "/";
  }, []);

  return { isSignedIn, signOut };
}
