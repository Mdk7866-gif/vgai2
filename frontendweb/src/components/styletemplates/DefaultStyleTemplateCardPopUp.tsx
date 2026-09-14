"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Palette, Sparkles, Layers, Loader2, Check, Plus, ZoomIn, Images } from "lucide-react";
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

  // Tracks which demo images have finished loading, keyed by slug, so a card
  // with a real demo_image_url shows a spinner while it's fetching instead of
  // the plain media-box background — indistinguishable at a glance from the
  // "No preview yet" empty state below, which is what actually has no image.
  const [loadedSlugs, setLoadedSlugs] = useState<Set<string>>(new Set());
  const markLoaded = (slug: string) =>
    setLoadedSlugs((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));

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
          <div className="relative w-full sm:max-w-6xl overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white dark:bg-surface shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-border h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
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
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                    aspectFilter === opt.value
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-500/50"
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
                  const demoUrls = template.demo_image_urls.length
                    ? template.demo_image_urls
                    : template.demo_image_url
                      ? [template.demo_image_url]
                      : [];
                  const importing = importingSlug === template.slug;
                  const imported = importedSlugs.includes(template.slug);
                  const imageLoaded = loadedSlugs.has(template.slug);

                  return (
                    <div
                      key={template.slug}
                      className="flex flex-col h-full bg-white dark:bg-surface border border-brand-200/70 dark:border-brand-500/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 transition duration-200"
                    >
                      {/* Media — a fixed 16:9 box always; a 9:16 template is
                          letterboxed inside it over a blurred copy of itself
                          rather than shrinking the box, so every card in this
                          grid lines up the same height. Click to zoom. */}
                      <div
                        role={demoUrls.length ? "button" : undefined}
                        tabIndex={demoUrls.length ? 0 : undefined}
                        onClick={() =>
                          demoUrls[0] &&
                          setZoomTarget({ url: demoUrls[0], alt: `${template.name} demo image 1` })
                        }
                        aria-label={
                          demoUrls.length ? `View demo gallery for ${template.name}` : "No preview image yet"
                        }
                        className={`group relative w-full aspect-video bg-slate-100 dark:bg-slate-900/60 overflow-hidden ${
                          demoUrls.length ? "cursor-zoom-in" : "cursor-default"
                        }`}
                        onKeyDown={(event) => {
                          if (demoUrls[0] && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            setZoomTarget({ url: demoUrls[0], alt: `${template.name} demo image 1` });
                          }
                        }}
                      >
                        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-brand-600/90 text-white shadow-sm">
                          <Layers className="w-3 h-3" />
                          Starter
                        </span>
                        {imported && (
                          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600/90 text-white shadow-sm">
                            <Check className="w-3 h-3" />
                            In library
                          </span>
                        )}

                        {demoUrls.length ? (
                          <>
                            {isPortrait && (
                              <Image
                                src={demoUrls[0]}
                                alt=""
                                aria-hidden="true"
                                fill
                                unoptimized
                                className={`object-cover scale-110 blur-xl transition-opacity duration-300 ${
                                  imageLoaded ? "opacity-40" : "opacity-0"
                                }`}
                              />
                            )}
                            <Image
                              src={demoUrls[0]}
                              alt={`${template.name} demo image 1`}
                              fill
                              unoptimized
                              onLoad={() => markLoaded(template.slug)}
                              className={`transition-opacity duration-300 ${
                                isPortrait ? "object-contain" : "object-cover"
                              } ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                            />
                            {!imageLoaded && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900/60">
                                <Loader2 className="w-6 h-6 text-brand-400 dark:text-brand-500 animate-spin" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-black/70 text-white">
                                <ZoomIn className="w-3.5 h-3.5" />
                                View gallery
                              </span>
                            </div>
                            {demoUrls.length > 1 && (
                              <div className="absolute inset-x-2 bottom-2 z-20 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                                {demoUrls.map((url, index) => (
                                  <button key={url} type="button" onClick={() => setZoomTarget({ url, alt: `${template.name} demo image ${index + 1}` })} className="relative h-9 flex-1 overflow-hidden rounded-md ring-1 ring-white/80 transition hover:ring-2 hover:ring-brand-300" aria-label={`View demo image ${index + 1}`}>
                                    <Image src={url} alt="" fill unoptimized className="object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                            <span className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white"><Images className="h-3 w-3" />{demoUrls.length} demo{demoUrls.length === 1 ? "" : "s"}</span>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-600">
                            <Palette className="w-8 h-8" />
                            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                              No preview yet
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="p-4 flex flex-col gap-3 flex-1">
                        <div>
                          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                            {template.name}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/30">
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
                            <Sparkles className="w-3.5 h-3.5 mt-px flex-shrink-0 text-brand-500 dark:text-brand-400" />
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
                          className={`mt-auto flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl text-[13px] font-semibold shadow-sm transition active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${
                            imported
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/30"
                              : "bg-white dark:bg-slate-900/60 text-brand-600 dark:text-brand-400 ring-1 ring-brand-200 dark:ring-brand-500/40 hover:bg-brand-50 dark:hover:bg-brand-500/10"
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
