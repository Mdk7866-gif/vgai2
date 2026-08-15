"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import CreditCoinIcon from "@/components/CreditCoinIcon";

interface AddCreditsPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (credits: number) => Promise<void>;
  submitting?: boolean;
}

// Pricing: 100 credits = $1 (see README §2). The user enters a USD amount, which
// buys credits at CREDITS_PER_USD; Razorpay is then charged in INR, priced per
// *credit* rather than per dollar — mirroring how the backend actually computes
// it (`amount_paise = credits * PAISE_PER_CREDIT` in app/routes/payments/crud.py).
// Deriving the preview from `credits` the same way the backend does is what keeps
// this readout equal to the amount Razorpay's modal shows; computing it from the
// USD figure with a separate rate is exactly how the two drifted apart before
// (a 97 here vs the backend's 100 previewed $5 as ₹485 against a real ₹500 charge).
// Keep PAISE_PER_CREDIT numerically in sync with the backend constant of the
// same name — nothing enforces it automatically.
const CREDITS_PER_USD = 100;
const PAISE_PER_CREDIT = 100;
const PRESET_USD = [5, 10, 25, 50];
const MIN_CREDITS = 10;
const MAX_CREDITS = 50000;
const MIN_USD = MIN_CREDITS / CREDITS_PER_USD;
const MAX_USD = MAX_CREDITS / CREDITS_PER_USD;

/** Keeps only digits and up to 2 decimal places, so the field can go empty while typing. */
function sanitizeAmountInput(raw: string): string {
  const value = raw.replace(/[^0-9.]/g, "");
  const firstDot = value.indexOf(".");
  if (firstDot === -1) return value;

  const intPart = value.slice(0, firstDot + 1);
  const fracPart = value.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  return intPart + fracPart;
}

export const AddCreditsPopUp = ({
  isOpen,
  onClose,
  onSubmit,
  submitting = false,
}: AddCreditsPopUpProps) => {
  // Re-initialized fresh each time the popup opens because the parent
  // remounts this component with a new `key` per open (see ProfilePage).
  // Kept as a raw string (not a number) so backspacing to empty doesn't
  // snap the field back to "0" mid-edit.
  const [amountInput, setAmountInput] = useState(String(PRESET_USD[0]));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const amountValue = parseFloat(amountInput);
  const hasValidAmount = Number.isFinite(amountValue) && amountInput.trim() !== "";
  const credits = hasValidAmount ? Math.round(amountValue * CREDITS_PER_USD) : 0;
  // Same arithmetic the backend runs on the credits it's sent, so this preview
  // always matches what Razorpay's modal will show.
  const inrAmount = (credits * PAISE_PER_CREDIT) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidAmount || credits < MIN_CREDITS || credits > MAX_CREDITS) {
      setError(`Enter an amount between $${MIN_USD} and $${MAX_USD}.`);
      return;
    }
    setError(null);
    try {
      await onSubmit(credits);
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
        className="relative w-full sm:max-w-lg overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60"
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCoinIcon className="w-5 h-5" />
            Add Credits
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-4 gap-2">
            {PRESET_USD.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setAmountInput(String(amount))}
                className={`py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                  amountInput === String(amount)
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-500/50"
                }`}
              >
                ${amount}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="credits-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Or enter a custom amount (USD)
            </label>
            <div className="flex items-center w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-400 transition-all">
              <span className="pl-3.5 text-slate-400 dark:text-slate-500 select-none">$</span>
              <input
                id="credits-amount"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(sanitizeAmountInput(e.target.value))}
                placeholder="0.00"
                className="w-full min-w-0 bg-transparent pl-1.5 pr-3.5 py-2.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            {!hasValidAmount && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                Enter an amount between ${MIN_USD} and ${MAX_USD}.
              </p>
            )}
          </div>

          {hasValidAmount && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">You&apos;ll receive</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {credits.toLocaleString()} credits
                </span>
              </div>
              <div className="flex items-center justify-between text-sm pt-1.5 border-t border-slate-200/70 dark:border-slate-700/50">
                <span className="text-slate-500 dark:text-slate-400">You&apos;ll be charged</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  ₹{inrAmount.toLocaleString()}{" "}
                  <span className="text-xs text-slate-400 dark:text-slate-500">(INR, test mode)</span>
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Rate: 100 credits = $1 USD. Payments are processed by Razorpay and currently charged in
            Indian Rupees (INR) — international currencies are coming soon.
          </p>

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
