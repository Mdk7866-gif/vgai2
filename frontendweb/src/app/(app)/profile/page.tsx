"use client";

import React, { useEffect, useState } from "react";
import { Loader2, LogIn, Plus, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";
import { loadRazorpayScript } from "@/lib/razorpay";
import type { User } from "@/types/user";
import AddCreditsPopUp from "@/components/profile/AddCreditsPopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import CreditCoinIcon from "@/components/CreditCoinIcon";

export default function ProfilePage() {
  const { user, requireAuth } = useAuth();

  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupKey, setPopupKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    type?: "success" | "error";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
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
  }, [user]);

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
          theme: { color: "#4f46e5" },
          handler: (response) => {
            authFetch("/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            })
              .then((res) => res.json())
              .then((updatedUser: User) => {
                setProfile(updatedUser);
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
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profile
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
          Your account, credit balance, and payment history.
        </p>
      </div>

      {!user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <UserIcon className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to view your profile</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Your profile, credit balance, and payment history are tied to your account.
          </p>
          <button
            onClick={() => requireAuth()}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        </div>
      ) : loading || !profile ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
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

          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3">
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
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-sm font-medium shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Credits
            </button>
          </div>
        </div>
      )}

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
