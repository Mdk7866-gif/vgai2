"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ImagePlus, Loader2 } from "lucide-react";
import type { Character } from "@/types/character";
import Toggle from "@/components/Toggle";

export interface CharacterFormValues {
  name: string;
  description: string;
  isDefault: boolean;
  imageFile: File | null;
}

interface EditCharacterCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  character?: Character | null;
  onSubmit: (values: CharacterFormValues) => Promise<void>;
  submitting?: boolean;
}

const MAX_DESCRIPTION_WORDS = 300;

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

export const EditCharacterCardPopUp = ({
  isOpen,
  onClose,
  mode,
  character,
  onSubmit,
  submitting = false,
}: EditCharacterCardPopUpProps) => {
  // Re-initialized fresh each time the popup opens because the parent
  // remounts this component with a new `key` per open (see CharactersPage).
  const [name, setName] = useState(character?.name ?? "");
  const [description, setDescription] = useState(character?.description ?? "");
  const [isDefault, setIsDefault] = useState(character?.is_default ?? false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(character?.character_sheet_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = countWords(description);
  const overWordLimit = wordCount > MAX_DESCRIPTION_WORDS;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, submitting]);

  const handleFileChange = (file: File | null) => {
    setImageFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : character?.character_sheet_url ?? null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    if (mode === "create" && !imageFile) {
      setError("Please upload a character sheet image.");
      return;
    }
    if (overWordLimit) {
      setError(`Description must be ${MAX_DESCRIPTION_WORDS} words or fewer.`);
      return;
    }

    setError(null);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), isDefault, imageFile });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-lg lg:max-w-3xl xl:max-w-4xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {mode === "create" ? "Add Character" : "Edit Character"}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col lg:flex-row gap-6">
          {/* Left: image + name */}
          <div className="lg:w-[38%] flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Character Sheet
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-full aspect-video rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 overflow-hidden flex items-center justify-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer"
              >
                {previewUrl ? (
                  <Image src={previewUrl} alt="Character sheet preview" fill unoptimized className="object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500 text-sm">
                    <ImagePlus className="w-6 h-6" />
                    Click to upload an image
                  </span>
                )}
                {previewUrl && (
                  <span className="absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center text-white text-sm font-medium opacity-0 hover:opacity-100 transition-all">
                    Change image
                  </span>
                )}
              </button>
            </div>

            <div>
              <label htmlFor="character-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Name
              </label>
              <input
                id="character-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nick, 30, male"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"
              />
            </div>

            {/* Is default */}
            <Toggle checked={isDefault} onChange={setIsDefault} label="Mark as default character" />
          </div>

          {/* Right: description */}
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between">
              <label htmlFor="character-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Description
              </label>
              <span
                className={`text-xs font-medium tabular-nums ${
                  overWordLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {wordCount}/{MAX_DESCRIPTION_WORDS} words
              </span>
            </div>
            <textarea
              id="character-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief physical appearance and personality"
              className={`w-full flex-1 min-h-[180px] lg:min-h-[260px] px-3.5 py-2.5 rounded-xl border bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all resize-none ${
                overWordLimit
                  ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                  : "border-slate-200 dark:border-slate-700 focus:ring-indigo-500/50 focus:border-indigo-400"
              }`}
            />
          </div>
        </div>

        {error && (
          <p className="px-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-4 px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "Add Character" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default EditCharacterCardPopUp;
