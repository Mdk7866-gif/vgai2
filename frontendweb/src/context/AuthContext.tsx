"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export type AccessMode = "allowed_all" | "allowed_only";

interface AccessRevokedDetail {
  mode: AccessMode | null;
  reason: string | null;
}

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
  /** The access-control mode active when the revoke happened -- lets the
   *  modal distinguish "you were specifically restricted" from "this app is
   *  invite-only and you're not on the list". Null until a revoke occurs. */
  accessRevokedMode: AccessMode | null;
  /** The admin's note on the matching restricted-list entry, if any. Only
   *  ever populated for an allowed_all-mode revoke -- see backend's
   *  enforce_access for why allowed_only has no per-user reason to show. */
  accessRevokedReason: string | null;
  /** The email that got revoked, captured from the session just before
   *  signOut() clears it, purely so the modal can say "x@y.com isn't...". */
  accessRevokedEmail: string | null;
  /** The product-wide mode, fetched unauthenticated so it's known even
   *  before sign-in (Navbar's "invite-only" note). Null until first fetched. */
  accessMode: AccessMode | null;
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
        window.dispatchEvent(
          new CustomEvent<AccessRevokedDetail>("vgai:access-revoked", {
            detail: { mode: body.detail.mode ?? null, reason: body.detail.reason ?? null },
          })
        );
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
  const [accessRevokedMode, setAccessRevokedMode] = useState<AccessMode | null>(null);
  const [accessRevokedReason, setAccessRevokedReason] = useState<string | null>(null);
  const [accessRevokedEmail, setAccessRevokedEmail] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode | null>(null);

  // Read (not subscribed-to) inside the revoke handler below so it always
  // sees the session as of the moment the event fires -- the handler is
  // registered once with `[]` deps, so closing over `session` directly would
  // capture it stale at mount (always null). Kept current via its own effect
  // rather than a render-time assignment (React disallows mutating a ref
  // during render, even to keep it in sync with props/state).
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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

  // The product-wide mode, independent of sign-in state -- fetched once on
  // mount so Navbar can show "this app is invite-only" even to a signed-out
  // visitor. Unauthenticated endpoint (see backend's GET /users/access_status),
  // so this never blocks on `loading`. Best-effort: a failed fetch just
  // leaves accessMode null, and the Navbar simply shows nothing extra.
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/access_status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.mode === "allowed_all" || body?.mode === "allowed_only") {
          setAccessMode(body.mode);
        }
      })
      .catch(() => {});
  }, []);

  // Raised by lib/api.ts and syncUserWithBackend above when the backend
  // rejects a request with ACCESS_REVOKED. Signs out immediately (the local
  // session is stale the moment the backend stops honoring it) and captures
  // mode/reason/email so AccessRevokedModal can explain *why*, instead of the
  // user just seeing scattered fetch failures or a bare "revoked" message.
  useEffect(() => {
    const handleAccessRevoked = (event: Event) => {
      const detail = (event as CustomEvent<AccessRevokedDetail>).detail;
      setAccessRevokedMode(detail?.mode ?? null);
      setAccessRevokedReason(detail?.reason ?? null);
      setAccessRevokedEmail(sessionRef.current?.user?.email ?? null);
      // The mode that just revoked access IS the current mode -- update the
      // general-purpose accessMode too, so a signed-out visitor who was just
      // kicked out doesn't see stale "allow all" copy anywhere else on the page.
      if (detail?.mode) setAccessMode(detail.mode);
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

  // Clears the whole revoke-detail bundle together -- leaving a stale reason/
  // email around after dismiss would show old copy for half a frame the next
  // time accessRevoked flips true.
  const dismissAccessRevoked = () => {
    setAccessRevoked(false);
    setAccessRevokedMode(null);
    setAccessRevokedReason(null);
    setAccessRevokedEmail(null);
  };

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
        accessRevokedMode,
        accessRevokedReason,
        accessRevokedEmail,
        accessMode,
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
