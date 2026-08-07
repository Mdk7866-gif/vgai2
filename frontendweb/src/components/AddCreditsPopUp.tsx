"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Coins, Loader2, X } from "lucide-react";

interface AddCreditsPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (credits: number) => Promise<void>;
  submitting?: boolean;
}

const PRESET_CREDITS = [500, 1000, 2500, 5000];
const MIN_CREDITS = 100;

export const AddCreditsPopUp = ({
  isOpen,
  onClose,
  onSubmit,
  submitting = false,
}: AddCreditsPopUpProps) => {
  // Re-initialized fresh each time the popup opens because the parent
  // remounts this component with a new `key` per open (see ProfilePage).
  const [credits, setCredits] = useState(PRESET_CREDITS[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(credits) || credits < MIN_CREDITS) {
      setError(`Enter at least ${MIN_CREDITS} credits.`);
      return;
    }
    setError(null);
    try {
      await onSubmit(Math.round(credits));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-md overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60"
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            Add Credits
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-4 gap-2">
            {PRESET_CREDITS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setCredits(amount)}
                className={`py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                  credits === amount
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-500/50"
                }`}
              >
                {amount}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="credits-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Or enter a custom amount
            </label>
            <input
              id="credits-amount"
              type="number"
              min={MIN_CREDITS}
              step={50}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"
            />
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Minimum {MIN_CREDITS} credits. Priced and charged in INR via Razorpay (test mode).
            </p>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Proceed to Pay
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default AddCreditsPopUp;
