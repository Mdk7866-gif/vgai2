"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Users, Sparkles, Loader2, Check, Plus, ZoomIn } from "lucide-react";
import type { DefaultCharacter } from "@/types/character";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";

interface DefaultCharacterCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  defaults: DefaultCharacter[];
  onImport: (character: DefaultCharacter) => void;
  importingSlug: string | null;
  importedSlugs: string[];
}

/**
 * The Starter Characters catalog, shown as one big popup card — the character
 * counterpart of DefaultStyleTemplateCardPopUp, same isOpen/onClose/portal-to-
 * body shape. Clicking the trigger on characters/page.tsx opens this, and every
 * catalog entry (sheet image, best-for, description, and its own "Add to
 * Library" button) is browsable inside it.
 *
 * No aspect-ratio filter here, unlike the style-template version: a character
 * sheet has no aspect-ratio meaning of its own, so there is nothing to filter on.
 */
export const DefaultCharacterCardPopUp = ({
  isOpen,
  onClose,
  defaults,
  onImport,
  importingSlug,
  importedSlugs,
}: DefaultCharacterCardPopUpProps) => {
  // Shared by every card's image so only one ImageZoomPopUp instance is needed
  // for the whole grid instead of one per card.
  const [zoomTarget, setZoomTarget] = useState<{ url: string; alt: string } | null>(null);

  // Tracks which sheets have finished loading, keyed by slug, so a card shows a
  // spinner while its image is fetching instead of a bare media box.
  const [loadedSlugs, setLoadedSlugs] = useState<Set<string>>(new Set());
  const markLoaded = (slug: string) =>
    setLoadedSlugs((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          {/* h-[85vh], not max-h — a fixed height keeps the popup the same size
              regardless of how many cards the catalog currently holds, with
              only the card grid below scrolling internally. */}
          <div className="relative w-full sm:max-w-6xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Starter Characters</h2>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                    {defaults.length} ready-made characters — add one to your library and edit it freely.
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

            <div className="flex-1 min-h-0 px-6 py-5 overflow-y-auto">
              {defaults.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center gap-2 h-full">
                  <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No starter characters available yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {defaults.map((character) => {
                    const importing = importingSlug === character.slug;
                    const imported = importedSlugs.includes(character.slug);
                    const imageLoaded = loadedSlugs.has(character.slug);

                    return (
                      <div
                        key={character.slug}
                        className="flex flex-col h-full bg-white dark:bg-slate-800/70 border border-violet-200/70 dark:border-violet-500/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 transition-all duration-200"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setZoomTarget({
                              url: character.character_sheet_url,
                              alt: `${character.name} character sheet`,
                            })
                          }
                          aria-label={`View full character sheet for ${character.name}`}
                          className="group relative w-full aspect-video bg-slate-100 dark:bg-slate-900/60 overflow-hidden cursor-zoom-in"
                        >
                          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-violet-600/90 text-white shadow-sm">
                            <Users className="w-3 h-3" />
                            Starter
                          </span>
                          {imported && (
                            <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600/90 text-white shadow-sm">
                              <Check className="w-3 h-3" />
                              In library
                            </span>
                          )}

                          <Image
                            src={character.character_sheet_url}
                            alt={`${character.name} character sheet`}
                            fill
                            unoptimized
                            onLoad={() => markLoaded(character.slug)}
                            className={`object-cover transition-opacity duration-300 ${
                              imageLoaded ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          {!imageLoaded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900/60">
                              <Loader2 className="w-6 h-6 text-violet-400 dark:text-violet-500 animate-spin" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-black/70 text-white">
                              <ZoomIn className="w-3.5 h-3.5" />
                              View full image
                            </span>
                          </div>
                        </button>

                        <div className="p-4 flex flex-col gap-3 flex-1">
                          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                            {character.name}
                          </h3>

                          {character.best_for && (
                            <div className="flex items-start gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                              <Sparkles className="w-3.5 h-3.5 mt-px flex-shrink-0 text-violet-500 dark:text-violet-400" />
                              <span className="line-clamp-2">
                                <span className="font-medium text-slate-600 dark:text-slate-300">Best for: </span>
                                {character.best_for}
                              </span>
                            </div>
                          )}

                          <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">
                            {character.description}
                          </p>

                          <button
                            type="button"
                            onClick={() => onImport(character)}
                            disabled={importing}
                            aria-label={`Add ${character.name} to your library`}
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

export default DefaultCharacterCardPopUp;
