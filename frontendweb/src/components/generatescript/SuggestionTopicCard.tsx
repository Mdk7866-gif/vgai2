"use client";

import React from "react";
import { Flame, Loader2, Sparkles } from "lucide-react";
import type { ViralTopic } from "@/types/scripttemplate";
import CreditCoinIcon from "@/components/CreditCoinIcon";

interface SuggestionTopicCardProps {
  topic: ViralTopic;
  creditCost: number;
  onGenerate: (topic: ViralTopic) => void;
  generating?: boolean;
  /** Disable Generate on every card while any one of them is generating. */
  disabled?: boolean;
}

export const SuggestionTopicCard = ({
  topic,
  creditCost,
  onGenerate,
  generating = false,
  disabled = false,
}: SuggestionTopicCardProps) => {
  return (
    <div className="bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
      <div className="p-4 pb-3 flex items-start gap-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
          <Flame className="w-4.5 h-4.5" />
        </div>
        <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 leading-snug">
          {topic.title}
        </h3>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4">
        <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
          {topic.reason}
        </p>

        <button
          onClick={() => onGenerate(topic)}
          disabled={disabled || generating}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-action-foreground bg-action hover:bg-action-hover rounded-lg shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Generating…" : "+ Generate"}
          {!generating && (
            <span className="flex items-center gap-1 pl-2 ml-0.5 border-l border-white/30 text-brand-100 dark:border-current/20 dark:text-action-foreground">
              <CreditCoinIcon className="w-3.5 h-3.5" />
              {creditCost}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default SuggestionTopicCard;
