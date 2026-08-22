"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  loginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  /** Returns true if already signed in. Otherwise opens the login modal and returns false. */
  requireAuth: () => boolean;
  /** True after the backend has rejected a request with ACCESS_REVOKED. */
  accessRevoked: boolean;
  dismissAccessRevoked: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Runs right after every sign-in, so it's the login-time half of access-
// control enforcement (the ongoing half is get_current_user on the backend,
// checked on every request). A restricted email never gets past this even on
// a brand-new login -- it dispatches the same event authFetch does, rather
// than duplicating the sign-out/modal logic here.
async function syncUserWithBackend(accessToken: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 403) {
      const body = await res.json().catch(() => null);
      if (body?.detail?.code === "ACCESS_REVOKED") {
        window.dispatchEvent(new CustomEvent("vgai:access-revoked"));
      }
    }
  } catch {
    // Non-fatal otherwise: the app still works, retried on next sign-in.
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);

      if (event === "SIGNED_IN" && newSession) {
        syncUserWithBackend(newSession.access_token);
        setLoginModalOpen(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Raised by lib/api.ts when the backend rejects a request with
  // ACCESS_REVOKED. Signs out immediately (the local session is stale the
  // moment the backend stops honoring it) and flags it so the UI can explain
  // why, instead of the user just seeing scattered fetch failures.
  useEffect(() => {
    const handleAccessRevoked = () => {
      setAccessRevoked(true);
      supabase.auth.signOut();
    };
    window.addEventListener("vgai:access-revoked", handleAccessRevoked);
    return () => window.removeEventListener("vgai:access-revoked", handleAccessRevoked);
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href,
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Supabase hands out a brand-new `session` (and so a new `session.user`
  // reference) on every token refresh and window focus, even when the signed-in
  // user hasn't actually changed. A lot of code across the app keys a
  // useEffect's dependency array on this `user` object expecting it to only
  // change on a real sign-in/out (ProjectsContext, CreditBalanceContext, the
  // characters/style_templates/generate_script pages) — without this, every one
  // of those re-fires (and re-fetches from the backend) on a plain token
  // refresh. Memoizing by id keeps `user`'s identity stable across refreshes
  // that don't change who's signed in.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const user = useMemo(() => session?.user ?? null, [session?.user?.id]);

  const openLoginModal = () => setLoginModalOpen(true);
  const closeLoginModal = () => setLoginModalOpen(false);

  const requireAuth = () => {
    if (session?.user) return true;
    openLoginModal();
    return false;
  };

  const dismissAccessRevoked = () => setAccessRevoked(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signOut,
        loginModalOpen,
        openLoginModal,
        closeLoginModal,
        requireAuth,
        accessRevoked,
        dismissAccessRevoked,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
