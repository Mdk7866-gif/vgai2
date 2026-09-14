"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";

type SubmitResponse = {
  status: "pending" | "approved" | "denied";
  message: string;
};

export default function HomePageAllowOnlyTheseUserAccessCard() {
  const { accessMode, loading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  // AuthContext already fetches the public /users/access_status endpoint.
  // Rendering from that shared value avoids a second mode request on Home.
  // A signed-out visitor needs the public mode before we know which panel is
  // correct. A resolved signed-in user can be welcomed immediately.
  if (loading || (!user && accessMode === null)) return null;

  if (user || accessMode === "allowed_all") {
    const fullName = user?.user_metadata?.full_name;
    const firstName = typeof fullName === "string" ? fullName.trim().split(/\s+/)[0] : null;

    return (
      <section className="relative overflow-hidden rounded-3xl border border-brand-200/80 bg-gradient-to-r from-brand-50 via-white to-brand-50 p-6 shadow-sm dark:border-brand-500/25 dark:from-brand-950/45 dark:via-slate-900/80 dark:to-brand-950/35 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand-300/25 blur-3xl dark:bg-brand-500/10" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-200 dark:shadow-brand-950/50">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
              {user ? "Your creative workspace" : "Open access"}
            </div>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              {firstName ? `Welcome back, ${firstName}` : "Welcome to vgAI2"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {user
                ? "You’re all set. Start a new project or continue building with your saved characters and style templates."
                : "vgAI2 is currently open to everyone. Explore the creative tools and sign in with Google when you’re ready to start building."}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter the Google account email you want to use with vgAI2.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await authFetch("/access-requests/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), purpose: purpose.trim() || null }),
      });
      setResult((await response.json()) as SubmitResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-brand-200/80 bg-gradient-to-br from-brand-50 via-white to-brand-50 p-6 shadow-sm dark:border-brand-500/25 dark:from-brand-950/45 dark:via-slate-900/80 dark:to-brand-950/35 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand-300/20 blur-3xl dark:bg-brand-500/10" />
      <div className="relative grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            vgAI2 is currently invite-only
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Request early access
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-300">
            Tell us which Google account you&apos;ll use. We review each request and add approved emails to the access list.
          </p>
          <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Clock3 className="h-4 w-4 text-brand-500" />
            You can submit again later if a previous request was denied.
          </div>
        </div>

        {result ? (
          <div className="rounded-2xl border border-emerald-200 bg-white/85 p-6 shadow-sm dark:border-emerald-500/25 dark:bg-slate-900/75">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
              {result.status === "approved" ? "You’re already approved" : "Request received"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.message}</p>
            {result.status === "approved" && (
              <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">Sign in using this exact Google email.</p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/75 sm:p-6">
            <label htmlFor="access-request-email" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Google account email</label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input id="access-request-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white" />
            </div>

            <label htmlFor="access-request-purpose" className="mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-100">
              What will you create? <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea id="access-request-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={1000} rows={4} placeholder="For example: history documentaries, educational Shorts, animated stories…" className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white" />
            <div className="mt-1 text-right text-[11px] tabular-nums text-slate-400">{purpose.length}/1000</div>

            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-action-foreground shadow-md shadow-brand-200 transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-brand-950/50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? "Submitting…" : "Request access"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
