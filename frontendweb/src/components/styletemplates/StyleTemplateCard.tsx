"use client";

import React from "react";
import { Pencil, Trash2, Star, Palette } from "lucide-react";
import type { StyleTemplate } from "@/types/styletemplate";

interface StyleTemplateCardProps {
  template: StyleTemplate;
  onEdit: (template: StyleTemplate) => void;
  onDelete: (template: StyleTemplate) => void;
}

const DENSITY_LABEL: Record<StyleTemplate["scene_density"], string> = {
  small: "Small density",
  medium: "Medium density",
  high: "High density",
};

export const StyleTemplateCard = ({ template, onEdit, onDelete }: StyleTemplateCardProps) => {
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
            {template.is_default && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <Star className="w-3 h-3 fill-current" />
                Default
              </span>
            )}
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

      <div className="p-4">
        <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed min-h-[3.9em]">
          {template.description}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30">
            Image {template.image_aspect_ratio}
          </span>
          <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/30">
            Video {template.video_aspect_ratio}
          </span>
          <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30">
            {DENSITY_LABEL[template.scene_density]}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StyleTemplateCard;
