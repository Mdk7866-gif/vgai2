import React from "react";
import MainLayout from "@/components/MainLayout";

// Deliberately does NOT gate on AuthContext's `loading` (the initial
// getSession() resolution) the way this used to. That blocked the entire
// chrome — Sidebar, Navbar, Footer — behind a bare full-screen spinner, then
// swapped in a completely different tree once the session resolved: the
// single biggest layout shift in the app, and it fired on every full page
// load. Sidebar/Navbar already render correct logged-out states for a null
// `user` (see CLAUDE.md's "gated actions, not gated views" pattern), so
// there's nothing left for this layout to block on.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <MainLayout>{children}</MainLayout>;
}
