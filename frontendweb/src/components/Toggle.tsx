"use client";

import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export const Toggle = ({ checked, onChange, label, ariaLabel, disabled = false }: ToggleProps) => {
  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label ?? "Toggle setting"}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${
        checked ? "bg-action" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5 dark:bg-action-foreground" : "translate-x-0 dark:bg-slate-100"
        }`}
      />
    </button>
  );

  if (!label) return switchEl;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      {switchEl}
    </div>
  );
};

export default Toggle;
