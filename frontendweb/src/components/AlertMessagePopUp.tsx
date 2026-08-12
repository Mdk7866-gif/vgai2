"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, X, CheckCircle2, Info, AlertTriangle } from "lucide-react";

type AlertType = "success" | "error" | "warning" | "info";

interface AlertMessagePopUpProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: AlertType;
}

const AlertMessagePopUp = ({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
}: AlertMessagePopUpProps) => {
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

  if (!mounted || (!isOpen && !show)) return null;

  const typeConfig = {
    success: {
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-50 dark:bg-emerald-500/15 ring-1 ring-emerald-200 dark:ring-emerald-500/30",
      topBorder: "border-t-emerald-500",
      headerBg: "bg-emerald-50/60 dark:bg-emerald-500/5",
      headerBorder: "border-b-emerald-200/80 dark:border-b-emerald-500/20",
    },
    error: {
      icon: AlertCircle,
      color: "text-red-600 dark:text-red-400",
      iconBg: "bg-red-50 dark:bg-red-500/15 ring-1 ring-red-200 dark:ring-red-500/30",
      topBorder: "border-t-red-500",
      headerBg: "bg-red-50/60 dark:bg-red-500/5",
      headerBorder: "border-b-red-200/80 dark:border-b-red-500/20",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-50 dark:bg-amber-500/15 ring-1 ring-amber-200 dark:ring-amber-500/30",
      topBorder: "border-t-amber-500",
      headerBg: "bg-amber-50/60 dark:bg-amber-500/5",
      headerBorder: "border-b-amber-200/80 dark:border-b-amber-500/20",
    },
    info: {
      icon: Info,
      color: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-50 dark:bg-blue-500/15 ring-1 ring-blue-200 dark:ring-blue-500/30",
      topBorder: "border-t-blue-500",
      headerBg: "bg-blue-50/60 dark:bg-blue-500/5",
      headerBorder: "border-b-blue-200/80 dark:border-b-blue-500/20",
    },
  };

  const Config = typeConfig[type];
  const Icon = Config.icon;

  return createPortal(
    <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal card */}
      <div className={`
        relative w-full sm:max-w-xl md:max-w-2xl overflow-hidden
        rounded-t-3xl sm:rounded-2xl
        bg-white dark:bg-slate-800/95
        backdrop-blur-xl
        shadow-2xl dark:shadow-slate-950/80
        ring-1 ring-slate-200/80 dark:ring-slate-700/60
        border-t-4 sm:border-t-4 ${Config.topBorder}
        transition-all duration-300 ease-out transform
        ${isOpen ? "translate-y-0 sm:scale-100 sm:opacity-100" : "translate-y-full sm:translate-y-6 sm:scale-95 sm:opacity-0"}
        pb-safe sm:pb-0
      `}>
        {/* Header */}
        <div className={`p-5 sm:p-7 flex gap-4 ${Config.headerBg} border-b ${Config.headerBorder}`}>
          <div className={`w-11 h-11 sm:w-12 sm:h-12 flex-shrink-0 rounded-xl flex items-center justify-center ${Config.iconBg}`}>
            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${Config.color}`} />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-white leading-snug">{title}</h3>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-7 py-4 flex justify-end items-center gap-3 bg-slate-50/80 dark:bg-slate-900/40">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm sm:text-base font-semibold text-white dark:text-slate-900 bg-slate-800 dark:bg-slate-100 hover:bg-slate-700 dark:hover:bg-white rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AlertMessagePopUp;
