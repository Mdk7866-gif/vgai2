"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#fcfcfc] dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-700 dark:border-t-indigo-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#fcfcfc] dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-6">
        <Logo />

        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Sign in to vgAI
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Your AI-powered video production workspace.
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-100 px-5 py-2.5 rounded-xl font-medium shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-all active:scale-95 cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
            />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
