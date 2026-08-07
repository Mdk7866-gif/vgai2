"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Pencil, Trash2, Star, Loader2 } from "lucide-react";
import type { Character } from "@/types/character";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";

interface CharacterCardProps {
  character: Character;
  onEdit: (character: Character) => void;
  onDelete: (character: Character) => void;
  onToggleDefault: (character: Character) => void;
  togglingDefault?: boolean;
}

export const CharacterCard = ({
  character,
  onEdit,
  onDelete,
  onToggleDefault,
  togglingDefault = false,
}: CharacterCardProps) => {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200">
      <div
        className="relative w-full aspect-video bg-slate-100 dark:bg-slate-900 cursor-zoom-in"
        onClick={() => setZoomOpen(true)}
      >
        <Image
          src={character.character_sheet_url}
          alt={character.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover"
        />

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDefault(character);
          }}
          disabled={togglingDefault}
          aria-label={character.is_default ? `Remove ${character.name} as default` : `Mark ${character.name} as default`}
          className={`absolute top-2.5 left-2.5 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
            character.is_default
              ? "bg-amber-500/95 text-white hover:bg-amber-500"
              : "bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400"
          }`}
        >
          {togglingDefault ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Star className={`w-3 h-3 ${character.is_default ? "fill-current" : ""}`} />
          )}
          {character.is_default ? "Default" : "Set default"}
        </button>

        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(character);
            }}
            aria-label={`Edit ${character.name}`}
            className="p-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(character);
            }}
            aria-label={`Delete ${character.name}`}
            className="p-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <ImageZoomPopUp
        isOpen={zoomOpen}
        onClose={() => setZoomOpen(false)}
        imageUrl={character.character_sheet_url}
        alt={character.name}
      />

      <div className="p-4">
        <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
          {character.name}
        </h3>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {character.description}
        </p>
      </div>
    </div>
  );
};

export default CharacterCard;
