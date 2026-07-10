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
        className="text-purple-600 dark:text-purple-400"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.15" />
        <path
          d="M10 10L16 22L22 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="3" fill="currentColor" />
      </svg>
      <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-500 dark:from-purple-400 dark:to-blue-400">
        vgAI
      </span>
    </div>
  );
};

export default Logo;
