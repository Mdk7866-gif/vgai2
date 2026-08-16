"use client";

import React from "react";
import Image from "next/image";
import { Pencil, Trash2, Star, Palette, Loader2, Sparkles } from "lucide-react";
import type { StyleTemplate } from "@/types/styletemplate";

interface StyleTemplateCardProps {
  template: StyleTemplate;
  onEdit: (template: StyleTemplate) => void;
  onDelete: (template: StyleTemplate) => void;
  onToggleDefault: (template: StyleTemplate) => void;
  togglingDefault?: boolean;
}

export const StyleTemplateCard = ({
  template,
  onEdit,
  onDelete,
  onToggleDefault,
  togglingDefault = false,
}: StyleTemplateCardProps) => {
  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200">
      <div className="relative p-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Palette className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
              {template.name}
            </h3>
            <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30">
              {template.image_aspect_ratio === "9:16" ? "9:16 · Reels" : "16:9 · Long Video"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(template)}
            aria-label={`Edit ${template.name}`}
            className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(template)}
            aria-label={`Delete ${template.name}`}
            className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {template.demo_image_url && (
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
      )}

      <div className="p-4 flex flex-col gap-3">
        <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed min-h-[3.9em]">
          {template.image_prompt}
        </p>

        {template.best_for && (
          <div className="flex items-start gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 mt-px flex-shrink-0 text-violet-500 dark:text-violet-400" />
            <span className="line-clamp-2">
              <span className="font-medium text-slate-600 dark:text-slate-300">Best for: </span>
              {template.best_for}
            </span>
          </div>
        )}

        <button
          onClick={() => onToggleDefault(template)}
          disabled={togglingDefault}
          aria-label={template.is_default ? `Remove ${template.name} as default` : `Mark ${template.name} as default`}
          className={`self-start flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
            template.is_default
              ? "bg-amber-500/95 text-white hover:bg-amber-500"
              : "bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:text-amber-600 dark:hover:text-amber-400"
          }`}
        >
          {togglingDefault ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Star className={`w-3 h-3 ${template.is_default ? "fill-current" : ""}`} />
          )}
          {template.is_default ? "Default" : "Set default"}
        </button>
      </div>
    </div>
  );
};

export default StyleTemplateCard;
