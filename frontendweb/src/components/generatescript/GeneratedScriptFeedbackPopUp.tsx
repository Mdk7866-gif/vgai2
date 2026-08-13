"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCcw, X } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import { scriptCreditCost } from "@/lib/scriptGenerationOptions";
import type { GeneratedScript } from "@/types/scripttemplate";
import CreditCoinIcon from "@/components/CreditCoinIcon";

interface GeneratedScriptFeedbackPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  generated: GeneratedScript | null;
  onImprovised: (updated: GeneratedScript) => void;
}

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

export const GeneratedScriptFeedbackPopUp = ({
  isOpen,
  onClose,
  generated,
  onImprovised,
}: GeneratedScriptFeedbackPopUpProps) => {
  const [feedback, setFeedback] = useState("");
  const { balance, refreshBalance } = useCreditBalance();
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creditCost = generated ? scriptCreditCost(generated.script_word_length) : 0;

  // Re-check every time this opens — the shared balance can go stale while it
  // sits closed (spent elsewhere in the app).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const startTimer = setTimeout(() => setLoadingBalance(true), 0);
    refreshBalance().finally(() => {
      if (!cancelled) setLoadingBalance(false);
    });
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, submitting]);

  const insufficientCredits = balance !== null && balance < creditCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generated) return;
    if (!feedback.trim()) {
      setError("Please describe what you'd like changed.");
      return;
    }
    setError(null);

    const freshBalance = await refreshBalance();
    if (freshBalance !== null && freshBalance < creditCost) {
      setError(`Not enough credits — improvising this script costs ${creditCost} credits, you have ${freshBalance}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch("/scripttemplates/improvise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generated_script_id: generated.id,
          feedback: feedback.trim(),
        }),
      });
      const data = await res.json();
      onImprovised({
        id: generated.id,
        script_template_id: data.script_template_id,
        topic: data.topic,
        script: data.script,
        word_count: data.word_count,
        characters: data.characters,
        script_word_length: generated.script_word_length,
      });
      setFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !generated) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-lg overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCcw className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Improvise Script</h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tell Claude what to change about <span className="font-medium text-slate-700 dark:text-slate-300">&ldquo;{generated.topic}&rdquo;</span> — it&apos;ll rewrite the full script based on your feedback.
          </p>
          <div>
            <label htmlFor="script-feedback" className={labelClass}>
              Feedback
            </label>
            <textarea
              id="script-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Make the hook punchier, add more tension in the middle, shorten the ending"
              rows={5}
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-auto px-6 py-4 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <CreditCoinIcon className="w-3.5 h-3.5" />
            {loadingBalance ? (
              <span>Checking balance…</span>
            ) : (
              <span className={insufficientCredits ? "text-red-600 dark:text-red-400" : ""}>
                {balance !== null ? `${balance} credits available` : ""}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || loadingBalance || insufficientCredits}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Improvise
            <span className="flex items-center gap-1 pl-2 ml-0.5 border-l border-white/30 text-indigo-100">
              <CreditCoinIcon className="w-3.5 h-3.5" />
              {creditCost}
            </span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default GeneratedScriptFeedbackPopUp;
