"use client";

import React, { useId } from "react";

interface CreditCoinIconProps {
  className?: string;
}

/**
 * Standard gold coin glyph for "credits" across the app (profile balance, Add Credits,
 * Generate popups, etc.) — swap in here instead of lucide's flat `Coins` icon so every
 * credit reference reads consistently as the same in-app currency.
 */
export const CreditCoinIcon = ({ className = "w-4 h-4" }: CreditCoinIconProps) => {
  const uid = useId();
  const rimId = `coin-rim-${uid}`;
  const faceId = `coin-face-${uid}`;

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={rimId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F3C64B" />
          <stop offset="55%" stopColor="#D89A1A" />
          <stop offset="100%" stopColor="#9C6B08" />
        </linearGradient>
        <radialGradient id={faceId} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="45%" stopColor="#FFD966" />
          <stop offset="100%" stopColor="#E8A916" />
        </radialGradient>
      </defs>

      <circle cx="12" cy="12" r="10" fill={`url(#${rimId})`} />
      <circle cx="12" cy="12" r="8.3" fill={`url(#${faceId})`} stroke="#B8790E" strokeOpacity="0.45" strokeWidth="0.5" />

      <path
        d="M9.9 9.1c0-1 1-1.75 2.2-1.75s2.2.6 2.2 1.5c0 .75-.6 1.05-1.5 1.35l-.9.28c-1.05.32-1.7.75-1.7 1.6 0 .95 1 1.7 2.2 1.7.85 0 1.55-.28 1.95-.7"
        stroke="#96650B"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.8"
      />
      <line x1="12" y1="6" x2="12" y2="7.35" stroke="#96650B" strokeWidth="1.15" strokeLinecap="round" opacity="0.8" />
      <line x1="12" y1="15.9" x2="12" y2="17.25" stroke="#96650B" strokeWidth="1.15" strokeLinecap="round" opacity="0.8" />

      <ellipse
        cx="8.7"
        cy="8.1"
        rx="1.7"
        ry="0.85"
        fill="#FFFFFF"
        opacity="0.4"
        transform="rotate(-32 8.7 8.1)"
      />
    </svg>
  );
};

export default CreditCoinIcon;
