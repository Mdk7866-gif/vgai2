"use client";

import React, { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import Footer from "./Footer";

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sidebarRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Close menu"]')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" && sidebarRef.current?.contains(document.activeElement)) {
        const items = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])')).filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === "Escape" && sidebarRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        setIsMobileMenuOpen(false);
      }
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const handleResize = () => { if (desktop.matches) setIsMobileMenuOpen(false); };
    document.addEventListener("keydown", handleKey);
    desktop.addEventListener("change", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKey);
      desktop.removeEventListener("change", handleResize);
      previousFocus?.focus();
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-slate-800 dark:text-slate-100 font-sans selection:bg-brand-100 dark:selection:bg-brand-900/40 selection:text-brand-900 dark:selection:text-brand-200">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-brand-600 focus:px-5 focus:py-3 focus:text-white">Skip to content</a>
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 dark:bg-slate-950/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div
        ref={sidebarRef}
        id="studio-navigation"
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isMobileMenuOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible"
        }`}
      >
        <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      <div inert={isMobileMenuOpen} className="flex-1 flex flex-col min-w-0 h-full">
        <Navbar mobileMenuOpen={isMobileMenuOpen} onMenuClick={() => setIsMobileMenuOpen(true)} />
        
        <main id="main-content" tabIndex={-1} className="relative flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto h-full w-full max-w-7xl 2xl:max-w-[100rem]">
            {children}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default MainLayout;
