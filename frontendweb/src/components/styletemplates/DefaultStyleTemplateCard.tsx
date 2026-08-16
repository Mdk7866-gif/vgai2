"use client";

import React from "react";
import Image from "next/image";
import { Palette, Sparkles, Plus, Loader2, Check, Layers } from "lucide-react";
import type { DefaultStyleTemplate } from "@/types/styletemplate";

interface DefaultStyleTemplateCardProps {
  template: DefaultStyleTemplate;
  onImport: (template: DefaultStyleTemplate) => void;
  importing?: boolean;
  /** Sticky per-session confirmation — the catalog entry stays listed after an
      import (importing twice is allowed), so without this the button would snap
      straight back to "Add to Library" and read as though nothing happened. */
  imported?: boolean;
}

const SCENE_DENSITY_LABELS: Record<DefaultStyleTemplate["scene_density"], string> = {
  small: "Small · most scenes",
  medium: "Medium",
  high: "High · fewest scenes",
};

export const DefaultStyleTemplateCard = ({
  template,
  onImport,
  importing = false,
  imported = false,
}: DefaultStyleTemplateCardProps) => {
  return (
    <div className="flex flex-col bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200">
      {template.demo_image_url ? (
        <div
          className={`relative w-full bg-slate-100 dark:bg-slate-900/60 ${
            template.image_aspect_ratio === "9:16" ? "aspect-[4/3]" : "aspect-video"
          }`}
        >
          <Image
            src={template.demo_image_url}
            alt={`${template.name} demo frame`}
            fill
            unoptimized
            className={template.image_aspect_ratio === "9:16" ? "object-contain" : "object-cover"}
          />
        </div>
      ) : (
        // Placeholder until demo images are produced — keeps the catalog grid on
        // a consistent card height instead of leaving ragged rows.
        <div className="relative w-full aspect-video bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-500/10 dark:to-indigo-500/10 flex items-center justify-center">
          <Palette className="w-8 h-8 text-violet-300 dark:text-violet-500/50" />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
            {template.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30">
              {template.image_aspect_ratio === "9:16" ? "9:16 · Reels" : "16:9 · Long Video"}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              <Layers className="w-3 h-3" />
              {SCENE_DENSITY_LABELS[template.scene_density]}
            </span>
          </div>
        </div>

        {template.best_for && (
          <div className="flex items-start gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 mt-px flex-shrink-0 text-violet-500 dark:text-violet-400" />
            <span className="line-clamp-2">
              <span className="font-medium text-slate-600 dark:text-slate-300">Best for: </span>
              {template.best_for}
            </span>
          </div>
        )}

        <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">
          {template.image_prompt}
        </p>

        <button
          onClick={() => onImport(template)}
          disabled={importing}
          aria-label={`Add ${template.name} to your library`}
          className={`mt-auto flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl text-[13px] font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${
            imported
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/30"
              : "bg-white dark:bg-slate-900/60 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
          }`}
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding…
            </>
          ) : imported ? (
            <>
              <Check className="w-4 h-4" />
              Added — add again
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add to Library
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default DefaultStyleTemplateCard;
