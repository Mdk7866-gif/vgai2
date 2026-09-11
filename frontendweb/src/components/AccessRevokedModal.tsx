"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";
import React from "react";
import { ShieldOff, UserX } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";

// Not closable by clicking the backdrop, unlike LoginModal -- this fires
// mid-session (see AuthContext's "vgai:access-revoked" listener), and the
// user is already signed out by the time it shows, so the only sane action
// is acknowledging it.
export const AccessRevokedModal = () => {
  const { accessRevoked, dismissAccessRevoked, accessRevokedMode, accessRevokedReason, accessRevokedEmail } =
    useAuth();

  const dialogRef = useDialogFocus(accessRevoked, () => {});

  if (!accessRevoked) return null;

  // Two genuinely different situations share this one modal, and they read
  // very differently to the person seeing them:
  //  - allowed_only: nothing personal happened -- the app is invite-only and
  //    this email simply isn't (yet) on the list. There's no per-user reason
  //    to show here (see backend's enforce_access docstring for why).
  //  - allowed_all (the default "open" mode): this email was specifically
  //    singled out and restricted, so show the admin's note when there is one.
  const inviteOnly = accessRevokedMode === "allowed_only";
  const title = inviteOnly ? "vgAI is invite-only right now" : "Access revoked";
  const body = inviteOnly
    ? `${accessRevokedEmail ? `${accessRevokedEmail} isn't` : "Your email isn't"} on the allowed list yet, so you've been signed out. Contact the admin if you'd like access.`
    : `Your access to vgAI has been revoked and you've been signed out.${
        accessRevokedReason ? ` Reason: ${accessRevokedReason}` : " Contact support if you believe this is a mistake."
      }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm" />

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="relative max-h-[90dvh] overflow-y-auto w-full max-w-md md:max-w-lg bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-3xl shadow-2xl p-6 sm:p-10 md:p-12 flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-200">
        <Logo />

        {inviteOnly ? (
          <UserX className="w-10 h-10 text-amber-500" />
        ) : (
          <ShieldOff className="w-10 h-10 text-red-500" />
        )}

        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">{body}</p>
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
