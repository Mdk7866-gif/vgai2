"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const readPreference = (): Theme | null => {
      try {
        const value = localStorage.getItem("theme");
        return value === "light" || value === "dark" ? value : null;
      } catch { return null; }
    };
    const apply = (next: Theme) => {
      document.documentElement.classList.toggle("dark", next === "dark");
      setTheme(next);
    };
    const resolve = () => readPreference() ?? (media.matches ? "dark" : "light");
    const timer = setTimeout(() => apply(resolve()), 0);
    const onSystemChange = () => { if (!readPreference()) apply(resolve()); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "theme" || event.key === null) apply(resolve());
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(timer);
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    try { localStorage.setItem("theme", nextTheme); } catch {
      // The visible theme still works when storage is unavailable.
    }
  };

  // Render children immediately to avoid blocking client rendering
  // (the script tag in layout.tsx will have already set the correct theme class)
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
