import { useLayoutEffect } from "react";

export function usePublicLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const hadLight = root.classList.contains("light");

    root.classList.remove("dark");
    root.classList.add("light");

    return () => {
      root.classList.remove("dark", "light");
      if (hadDark) root.classList.add("dark");
      if (hadLight) root.classList.add("light");
    };
  }, []);
}
