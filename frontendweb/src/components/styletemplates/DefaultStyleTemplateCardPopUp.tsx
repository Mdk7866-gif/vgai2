"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Palette, Sparkles, Layers, Loader2, Check, Plus, ZoomIn } from "lucide-react";
import type { DefaultStyleTemplate } from "@/types/styletemplate";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";

interface DefaultStyleTemplateCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  defaults: DefaultStyleTemplate[];
  onImport: (template: DefaultStyleTemplate) => void;
  importingSlug: string | null;
  importedSlugs: string[];
}

const SCENE_DENSITY_LABELS: Record<DefaultStyleTemplate["scene_density"], string> = {
  small: "Small · most scenes",
  medium: "Medium",
  high: "High · fewest scenes",
};

type AspectFilter = "all" | "16:9" | "9:16";

const ASPECT_FILTER_OPTIONS: { value: AspectFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "16:9", label: "16:9 · Long Video" },
  { value: "9:16", label: "9:16 · Reels" },
];

/**
 * The Starter Templates catalog, shown as one big popup card (same isOpen/
 * onClose/portal-to-body shape as ImageZoomPopUp, ConformationMessagePopUp,
 * ManualImageGenerationPromptCopyPopUp, AddCreditsPopUp, etc.) rather than an
 * inline dropdown on the page — clicking a trigger on style_templates/page.tsx
 * opens this, and every catalog entry (image, badges, best-for, a prompt
 * excerpt, and its own "Add to Library" button) is browsable inside it.
 */
export const DefaultStyleTemplateCardPopUp = ({
  isOpen,
  onClose,
  defaults,
  onImport,
  importingSlug,
  importedSlugs,
}: DefaultStyleTemplateCardPopUpProps) => {
  // Shared by every card's image so only one ImageZoomPopUp instance is needed
  // for the whole grid instead of one per card.
  const [zoomTarget, setZoomTarget] = useState<{ url: string; alt: string } | null>(null);
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>("all");

  if (!isOpen) return null;

  const filteredDefaults =
    aspectFilter === "all" ? defaults : defaults.filter((t) => t.image_aspect_ratio === aspectFilter);

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          {/* h-[85vh], not max-h — a max-height lets the panel shrink to fit
              whatever the current filter leaves (one card after filtering
              looked like a tiny, oddly-shaped dialog); a fixed height keeps
              the popup the same size regardless of how many cards are
              showing, with only the card grid below scrolling internally. */}
          <div className="relative w-full sm:max-w-6xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Starter Templates</h2>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                    {defaults.length} ready-made styles — add one to your library and edit it freely.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3.5 flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-700/60">
              {ASPECT_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAspectFilter(opt.value)}
                  aria-pressed={aspectFilter === opt.value}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    aspectFilter === opt.value
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-500/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 px-6 py-5 overflow-y-auto">
              {filteredDefaults.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center gap-2 h-full">
                  <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No starter templates match this filter.
                  </p>
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredDefaults.map((template) => {
                  const isPortrait = template.image_aspect_ratio === "9:16";
                  const importing = importingSlug === template.slug;
                  const imported = importedSlugs.includes(template.slug);

                  return (
                    <div
                      key={template.slug}
                      className="flex flex-col h-full bg-white dark:bg-slate-800/70 border border-violet-200/70 dark:border-violet-500/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 transition-all duration-200"
                    >
                      {/* Media — a fixed 16:9 box always; a 9:16 template is
                          letterboxed inside it over a blurred copy of itself
                          rather than shrinking the box, so every card in this
                          grid lines up the same height. Click to zoom. */}
                      <button
                        type="button"
                        onClick={() =>
                          template.demo_image_url &&
                          setZoomTarget({ url: template.demo_image_url, alt: `${template.name} demo frame` })
                        }
                        disabled={!template.demo_image_url}
                        aria-label={
                          template.demo_image_url ? `View full image for ${template.name}` : "No preview image yet"
                        }
                        className={`group relative w-full aspect-video bg-slate-100 dark:bg-slate-900/60 overflow-hidden ${
                          template.demo_image_url ? "cursor-zoom-in" : "cursor-default"
                        }`}
                      >
                        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-violet-600/90 text-white shadow-sm">
                          <Layers className="w-3 h-3" />
                          Starter
                        </span>
                        {imported && (
                          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600/90 text-white shadow-sm">
                            <Check className="w-3 h-3" />
                            In library
                          </span>
                        )}

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
                            <Palette className="w-8 h-8" />
                            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                              No preview yet
                            </span>
                          </div>
                        )}
                      </button>

                      <div className="p-4 flex flex-col gap-3 flex-1">
                        <div>
                          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                            {template.name}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30">
                              {isPortrait ? "9:16 · Reels" : "16:9 · Long Video"}
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
                          type="button"
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
                })}
              </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <ImageZoomPopUp
        isOpen={!!zoomTarget}
        onClose={() => setZoomTarget(null)}
        imageUrl={zoomTarget?.url ?? ""}
        alt={zoomTarget?.alt ?? ""}
      />
    </>
  );
};

export default DefaultStyleTemplateCardPopUp;
