"use client";

import React, { useEffect, useState } from "react";
import { LogIn, Plus, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import { authFetch } from "@/lib/api";
import { loadRazorpayScript } from "@/lib/razorpay";
import type { User } from "@/types/user";
import AddCreditsPopUp from "@/components/profile/AddCreditsPopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import CreditCoinIcon from "@/components/CreditCoinIcon";
import PaymentAndUsageHistoryTabCard from "@/components/profile/PaymentAndUsageHistoryTabCard";

export default function ProfilePage() {
  const { user, requireAuth, loading: authLoading } = useAuth();
  const { setBalance: setNavbarBalance } = useCreditBalance();

  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupKey, setPopupKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a successful top-up to remount the history card, which is how
  // its per-tab fetch cache gets invalidated so the new payment shows up. The
  // key is namespaced where it's used: this and popupKey are both siblings in
  // this component's children array and both start at 0, so the bare counters
  // would collide into React's "two children with the same key" warning.
  const [historyKey, setHistoryKey] = useState(0);
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    type?: "success" | "error";
  } | null>(null);

  // Keyed on the id, not the `user` object: AuthContext hands out a fresh
  // session (and so a fresh user object) on every token refresh and window
  // focus, which would otherwise re-run this effect — and flip `loading` — for
  // a user that never actually changed.
  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      const timer = setTimeout(() => {
        setProfile(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const startTimer = setTimeout(() => setLoading(true), 0);

    authFetch("/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setAlert({
            title: "Failed to load profile",
            message: err instanceof Error ? err.message : "Something went wrong.",
            type: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [userId]);

  const handleAddCreditsClick = () => {
    if (!requireAuth()) return;
    setPopupKey((k) => k + 1);
    setPopupOpen(true);
  };

  const handlePurchase = async (credits: number) => {
    setSubmitting(true);
    try {
      await loadRazorpayScript();

      const orderRes = await authFetch("/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits }),
      });
      const order = await orderRes.json();

      await new Promise<void>((resolve, reject) => {
        const razorpay = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          order_id: order.order_id,
          name: "vgAI",
          description: `${credits} credits`,
          prefill: {
            name: profile?.name ?? undefined,
            email: profile?.email,
          },
          theme: { color: "#6d28d9" },
          handler: (response) => {
            authFetch("/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            })
              .then((res) => res.json())
              .then((updatedUser: User) => {
                setProfile(updatedUser);
                setNavbarBalance(updatedUser.current_credit_balance);
                setHistoryKey((k) => k + 1);
                setPopupOpen(false);
                setAlert({
                  title: "Credits added",
                  message: `${credits} credits were added to your account.`,
                  type: "success",
                });
                resolve();
              })
              .catch(reject);
          },
          modal: {
            // User closed the checkout without paying — nothing to do.
            ondismiss: () => resolve(),
          },
        });
        razorpay.open();
      });
    } catch (err) {
      setAlert({
        title: "Payment failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const avatarUrl = profile?.profile_image_url ?? user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  return (
    <div className="flex flex-col gap-8 pb-16 animate-in fade-in duration-500">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-border dark:bg-surface sm:p-8">
        <p className="eyebrow mb-3">Your account</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Account & credits
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
          Your account, credit balance, and where your credits have gone.
        </p>
      </div>

      {!authLoading && !user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl">
          <div className="w-12 h-12 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center">
            <UserIcon className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to view your profile</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Your profile, credit balance, and payment history are tied to your account.
          </p>
          <button
            onClick={() => requireAuth()}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        </div>
      ) : !user || loading || !profile ? (
        /* Same wrapper classes and 80px avatar as the real card below, so the
           two render at an identical height and the swap shifts nothing. Also
           covers the auth-loading window, which would otherwise flash the
           logged-out prompt before the session resolves. */
        <div className="bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl p-6 sm:p-8 flex flex-col xl:flex-row items-start xl:items-center gap-6 animate-pulse">
          <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700/50 flex-shrink-0" />
          <div className="flex-1 min-w-0 w-full flex flex-col gap-2.5">
            <div className="h-5 w-40 max-w-full rounded bg-slate-100 dark:bg-slate-700/50" />
            <div className="h-4 w-56 max-w-full rounded bg-slate-100 dark:bg-slate-700/50" />
          </div>
          <div className="h-[65px] w-full sm:w-[282px] rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-border flex-shrink-0" />
        </div>
      ) : (
        <div className="bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl p-6 sm:p-8 flex flex-col xl:flex-row items-start xl:items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 overflow-hidden flex-shrink-0">
            {avatarUrl && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={profile.name ?? "Profile"}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-8 h-8" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white truncate">
              {profile.name ?? "Unnamed"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <CreditCoinIcon className="w-5 h-5" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Credit Balance</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">
                  {profile.current_credit_balance}
                </p>
              </div>
            </div>
            <button
              onClick={handleAddCreditsClick}
              className="flex items-center gap-1.5 bg-action hover:bg-action-hover text-action-foreground px-3.5 py-2 rounded-lg text-sm font-medium shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Credits
            </button>
          </div>
        </div>
      )}

      {/* Gated on `user` alone, deliberately not on this page's `loading`/`profile`:
          tying it to the profile fetch would unmount the card on every refetch,
          throwing away both the selected tab and its cached data. It renders its
          own loading state. */}
      {user && <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-600 dark:border-border dark:bg-surface dark:text-slate-300">Credits are reserved when generation starts. Cancelling a generation does not refund its credits; provider failures are refunded automatically.</p>}
      {user && <PaymentAndUsageHistoryTabCard key={`history-${historyKey}`} />}

      <AddCreditsPopUp
        key={popupKey}
        isOpen={popupOpen}
        onClose={() => !submitting && setPopupOpen(false)}
        onSubmit={handlePurchase}
        submitting={submitting}
      />

      <AlertMessagePopUp
        isOpen={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? ""}
        message={alert?.message ?? ""}
        type={alert?.type ?? "error"}
      />
    </div>
  );
}
