import React from "react";

export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-brand-600 dark:text-brand-400"
      >
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <path
          d="M10 10L16 22L22 10"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="2.5" fill="white" />
      </svg>
      <span className="text-xl font-bold tracking-[-.04em] text-slate-950 dark:text-white">
        vgAI2
      </span>
    </div>
  );
};

export default Logo;
