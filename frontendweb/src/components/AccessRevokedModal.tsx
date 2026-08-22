"use client";

import React from "react";
import { ShieldOff } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";

// Not closable by clicking the backdrop, unlike LoginModal -- this fires
// mid-session (see AuthContext's "vgai:access-revoked" listener), and the
// user is already signed out by the time it shows, so the only sane action
// is acknowledging it.
export const AccessRevokedModal = () => {
  const { accessRevoked, dismissAccessRevoked } = useAuth();

  if (!accessRevoked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-md md:max-w-lg bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700/80 rounded-3xl shadow-2xl p-10 md:p-12 flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-200">
        <Logo />

        <ShieldOff className="w-10 h-10 text-red-500" />

        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Access revoked
          </h2>
          <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
            Your access to vgAI has been revoked and you&apos;ve been signed out.
            Contact support if you believe this is a mistake.
          </p>
        </div>

        <button
          onClick={dismissAccessRevoked}
          className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3.5 rounded-xl font-medium text-[15px] shadow-sm hover:opacity-90 transition-all active:scale-95 cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default AccessRevokedModal;
