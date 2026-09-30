import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const storageKey = "spill-theme";

function getInitialTheme(): Theme {
  return localStorage.getItem(storageKey) === "light" ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(storageKey, theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark")),
  };
}
