"use client";

import React, { useEffect, useState } from "react";
import Logo from "./Logo";

const SplashScreen = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Check if the user has already visited in this session
    const hasVisited = sessionStorage.getItem("vgai_has_visited");
    
    if (hasVisited) {
      // If already visited, remove splash screen from DOM immediately (deferred to prevent synchronous warning)
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      sessionStorage.setItem("vgai_has_visited", "true");
      
      // Start fade out after 2 seconds
      const fadeTimer = setTimeout(() => {
        setIsFading(true);
      }, 2000);

      // Remove from DOM after fade out completes
      const removeTimer = setTimeout(() => {
        setIsVisible(false);
      }, 2500);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`splash-screen-container fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-slate-950 transition-opacity duration-500 ease-in-out ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="animate-pulse flex flex-col items-center">
        <Logo className="scale-150 mb-8" />
        <div className="text-zinc-500 dark:text-slate-400 mt-4 tracking-widest text-sm uppercase font-medium">
          Initializing Workspace...
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
