"use client";

import React from "react";
import Image from "next/image";
import { Pencil, Trash2, Star } from "lucide-react";
import type { Character } from "@/types/character";

interface CharacterCardProps {
  character: Character;
  onEdit: (character: Character) => void;
  onDelete: (character: Character) => void;
}

export const CharacterCard = ({ character, onEdit, onDelete }: CharacterCardProps) => {
  return (
    <div className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200">
      <div className="relative w-full aspect-video bg-slate-100 dark:bg-slate-900">
        <Image
          src={character.character_sheet_url}
          alt={character.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover"
        />

        {character.is_default && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-amber-500/95 text-white text-[11px] font-semibold px-2 py-1 rounded-full shadow-sm">
            <Star className="w-3 h-3 fill-current" />
            Default
          </span>
        )}

        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <button
            onClick={() => onEdit(character)}
            aria-label={`Edit ${character.name}`}
            className="p-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(character)}
            aria-label={`Delete ${character.name}`}
            className="p-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

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
