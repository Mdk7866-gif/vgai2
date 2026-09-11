"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Pencil, Trash2, Star, Palette, Loader2, Sparkles, ImageOff, ZoomIn, Download, Share2 } from "lucide-react";
import type { StyleTemplate } from "@/types/styletemplate";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";
import { downloadStyleTemplateJson, shareStyleTemplateJson } from "@/lib/styleTemplateShare";

interface StyleTemplateCardProps {
  template: StyleTemplate;
  onEdit: (template: StyleTemplate) => void;
  onDelete: (template: StyleTemplate) => void;
  onToggleDefault: (template: StyleTemplate) => void;
  togglingDefault?: boolean;
  /** Surfaces a download/share failure to the page's shared alert popup —
   * both actions otherwise fail silently from inside this card. */
  onShareError?: (message: string) => void;
}

export const StyleTemplateCard = ({
  template,
  onEdit,
  onDelete,
  onToggleDefault,
  togglingDefault = false,
  onShareError,
}: StyleTemplateCardProps) => {
  const isPortrait = template.image_aspect_ratio === "9:16";
  const [zoomOpen, setZoomOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleDownload = () => {
    try {
      downloadStyleTemplateJson(template);
    } catch (err) {
      onShareError?.(err instanceof Error ? err.message : "Failed to download style template.");
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      await shareStyleTemplateJson(template);
    } catch (err) {
      onShareError?.(err instanceof Error ? err.message : "Failed to share style template.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface border border-slate-200/80 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm hover:border-brand-300 dark:hover:border-brand-400/40 hover:shadow-xl hover:shadow-brand-950/10 motion-safe:hover:-translate-y-1 transition-all duration-200">
      {/* Header — name/actions row, then a badge row that is always exactly one
          line tall (best_for is `invisible`-collapsed rather than omitted when
          absent) so every card's media box below starts at the same y no matter
          how much header content a given template has. */}
      <div className="p-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-700/60 flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 flex-shrink-0 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <Palette className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-[14px] text-slate-900 dark:text-slate-100 truncate">
              {template.name}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleDownload}
              aria-label={`Download ${template.name} as JSON`}
              title="Download as JSON"
              className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleShare}
              disabled={sharing}
              aria-label={`Share ${template.name}`}
              title="Share"
              className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onEdit(template)}
              aria-label={`Edit ${template.name}`}
              className="p-2 rounded-full bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 shadow-sm hover:shadow transition-all cursor-pointer"
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

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/30">
            {isPortrait ? "9:16 · Reels" : "16:9 · Long Video"}
          </span>

          <button
            onClick={() => onToggleDefault(template)}
            disabled={togglingDefault}
            aria-label={template.is_default ? `Remove ${template.name} as default` : `Mark ${template.name} as default`}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
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

        <div
          className={`flex items-center gap-1.5 text-[12px] ${
            template.best_for ? "text-slate-500 dark:text-slate-400" : "invisible"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-brand-500 dark:text-brand-400" />
          <span className="truncate" title={template.best_for ?? undefined}>
            <span className="font-medium text-slate-600 dark:text-slate-300">Best for: </span>
            {template.best_for || "—"}
          </span>
        </div>
      </div>

      {/* Media — a fixed 16:9 box on every card, regardless of the template's
          own aspect ratio. A 9:16 image is letterboxed inside it (object-contain)
          over a blurred, scaled-up copy of itself filling the extra space, rather
          than shrinking the box to 4:3 — that used to make 9:16 cards shorter
          than 16:9 ones and shift every card's footer to a different height. */}
      <button
        type="button"
        onClick={() => template.demo_image_url && setZoomOpen(true)}
        disabled={!template.demo_image_url}
        aria-label={template.demo_image_url ? `View full image for ${template.name}` : "No preview image"}
        className={`group relative w-full aspect-video bg-slate-100 dark:bg-slate-900/60 overflow-hidden ${
          template.demo_image_url ? "cursor-zoom-in" : "cursor-default"
        }`}
      >
        {template.demo_image_url ? (
          <>
            {isPortrait && (
              <Image
                src={template.demo_image_url}
                alt=""
                aria-hidden="true"
                fill
                unoptimized
                className="object-cover scale-110 blur-xl opacity-40"
              />
            )}
            <Image
              src={template.demo_image_url}
              alt={`${template.name} demo frame`}
              fill
              unoptimized
              className={isPortrait ? "object-contain" : "object-cover"}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-black/70 text-white">
                <ZoomIn className="w-3.5 h-3.5" />
                View full image
              </span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-600">
            <ImageOff className="w-6 h-6" />
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">No preview</span>
          </div>
        )}
      </button>

      {/* Footer — a short prompt excerpt only; everything else already lives
          in the header, so this box's height depends on nothing but the text. */}
      <div className="p-3.5">
        <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed min-h-[3.9em]">
          {template.image_prompt}
        </p>
      </div>

      <ImageZoomPopUp
        isOpen={zoomOpen}
        onClose={() => setZoomOpen(false)}
        imageUrl={template.demo_image_url ?? ""}
        alt={`${template.name} demo frame`}
      />
    </div>
  );
};

export default StyleTemplateCard;
