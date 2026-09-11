"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, Loader2, X } from "lucide-react";

interface ConformationMessagePopUpProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  /** Show a spinner and disable all buttons/backdrop-close, e.g. while an async onConfirm is in flight. */
  confirming?: boolean;
}

const ConformationMessagePopUp = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  confirming = false,
}: ConformationMessagePopUpProps) => {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setShow(true), 0);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const dialogRef = useDialogFocus(isOpen && mounted, () => { if (!confirming) onClose(); });

  if (!mounted || (!isOpen && !show)) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={() => !confirming && onClose()} />

      {/* Modal card */}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`
        relative max-h-[90dvh] overflow-y-auto w-full sm:max-w-xl md:max-w-2xl
        rounded-t-3xl sm:rounded-2xl
        bg-white dark:bg-surface
        backdrop-blur-xl
        shadow-2xl dark:shadow-slate-950/80
        ring-1 ring-slate-200/80 dark:ring-border
        border-t-4 sm:border-t-4 ${isDestructive ? "border-t-red-500" : "border-t-brand-500"}
        transition-all duration-300 ease-out transform
        ${isOpen ? "translate-y-0 sm:scale-100 sm:opacity-100" : "translate-y-full sm:translate-y-6 sm:scale-95 sm:opacity-0"}
        pb-safe sm:pb-0
      `}>
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 rounded-2xl flex items-center justify-center ring-1 ${
              isDestructive
                ? "bg-red-50 dark:bg-red-500/15 ring-red-200 dark:ring-red-500/30 text-red-600 dark:text-red-400"
                : "bg-brand-50 dark:bg-brand-500/15 ring-brand-200 dark:ring-brand-500/30 text-brand-600 dark:text-brand-400"
            }`}>
              <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex-1 mt-0.5 min-w-0 pr-6">
              <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white leading-snug">{title}</h3>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
            </div>
          </div>
          <button
            onClick={() => !confirming && onClose()}
            disabled={confirming}
            aria-label="Close"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-7 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={() => !confirming && onClose()}
            disabled={confirming}
            className="px-4 py-2 text-sm sm:text-base font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm sm:text-base font-semibold text-white rounded-lg shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed ${
              isDestructive
                ? "bg-red-600 hover:bg-red-500 shadow-red-500/20 dark:shadow-red-500/10"
                : "bg-action hover:bg-action-hover dark:text-action-foreground shadow-brand-500/20 dark:shadow-none"
            }`}
          >
            {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConformationMessagePopUp;
