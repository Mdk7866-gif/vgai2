"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ImagePlus, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { Character } from "@/types/character";
import CreditCoinIcon from "@/components/CreditCoinIcon";
import Toggle from "@/components/Toggle";

const GENERATE_CREDIT_COST = 4;
const GENERATE_PRO_CREDIT_COST = 20;
const MAX_DESCRIPTION_WORDS = 300;

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

interface GenerateResult {
  character_prompt: string;
  image_base64: string;
  credits_spent: number;
  credits_remaining: number;
}

interface GenerateCharacterSheetPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the user accepts a generated sheet and it's been saved to the character library. */
  onAccepted: (character: Character) => void;
}

export const GenerateCharacterSheetPopUp = ({
  isOpen,
  onClose,
  onAccepted,
}: GenerateCharacterSheetPopUpProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [proMode, setProMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = countWords(description);
  const overWordLimit = wordCount > MAX_DESCRIPTION_WORDS;

  useEffect(() => {
    let cancelled = false;
    authFetch("/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setBalance(data.current_credit_balance);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBalance(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generating && !accepting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, generating, accepting]);

  const handleFileChange = (file: File | null) => {
    setReferenceFile(file);
    setReferencePreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!generating) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (generating) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleFileChange(file);
  };

  const creditCost = proMode ? GENERATE_PRO_CREDIT_COST : GENERATE_CREDIT_COST;
  const insufficientCredits = balance !== null && balance < creditCost;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    if (overWordLimit) {
      setError(`Description must be ${MAX_DESCRIPTION_WORDS} words or fewer.`);
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("character_name", name.trim());
      formData.append("description", description.trim());
      formData.append("pro", String(proMode));
      if (referenceFile) formData.append("reference_image", referenceFile);

      const res = await authFetch("/characters/generate", { method: "POST", body: formData });
      const data: GenerateResult = await res.json();
      setResult(data);
      setBalance(data.credits_remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReject = () => {
    setResult(null);
    setError(null);
  };

  const handleAccept = async () => {
    if (!result) return;
    setAccepting(true);
    setError(null);
    try {
      const imageRes = await fetch(result.image_base64);
      const blob = await imageRes.blob();
      const imageFile = new File([blob], "character-sheet.png", { type: "image/png" });

      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", result.character_prompt);
      formData.append("is_default", "false");
      formData.append("character_sheet", imageFile);

      const res = await authFetch("/characters/create", { method: "POST", body: formData });
      const created: Character = await res.json();
      onAccepted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAccepting(false);
    }
  };

  if (!isOpen) return null;

  const busy = generating || accepting;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={() => !busy && onClose()}
      />

      <div className="relative w-full sm:max-w-lg lg:max-w-3xl xl:max-w-4xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Generate Character Sheet
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5 min-h-[320px]">
          {generating ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Generating your character sheet…
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {proMode ? "This can take 1–2 minutes. Please wait." : "This can take 30–60 seconds. Please wait."}
                </p>
              </div>
            </div>
          ) : !result ? (
            <form id="generate-character-form" onSubmit={handleGenerate} className="flex flex-col lg:flex-row gap-6">
              <div className="lg:w-[38%] flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Reference Image (optional)
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
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative w-full aspect-video rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center transition-colors cursor-pointer ${
                      isDraggingOver
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                        : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 hover:border-indigo-400 dark:hover:border-indigo-500"
                    }`}
                  >
                    {referencePreviewUrl ? (
                      <Image src={referencePreviewUrl} alt="Reference preview" fill unoptimized className="object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500 text-sm text-center px-3">
                        <ImagePlus className="w-6 h-6" />
                        {isDraggingOver ? "Drop image here" : "Click or drag & drop a reference photo"}
                      </span>
                    )}
                  </button>
                </div>

                <div>
                  <label htmlFor="gen-character-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Name
                  </label>
                  <input
                    id="gen-character-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Nick, 30, male"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3.5 py-2.5">
                  <Toggle
                    checked={proMode}
                    onChange={setProMode}
                    label={`Generate with Pro · higher quality, ${GENERATE_PRO_CREDIT_COST} credits`}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <label htmlFor="gen-character-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
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
                  id="gen-character-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief physical appearance and personality"
                  className={`w-full flex-1 min-h-[180px] lg:min-h-[220px] px-3.5 py-2.5 rounded-xl border bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all resize-none ${
                    overWordLimit
                      ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                      : "border-slate-200 dark:border-slate-700 focus:ring-indigo-500/50 focus:border-indigo-400"
                  }`}
                />
              </div>
            </form>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="lg:w-[55%] relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 flex-shrink-0">
                <Image
                  src={result.image_base64}
                  alt="Generated character sheet"
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Generated Prompt</h3>
                <div className="flex-1 max-h-56 lg:max-h-none overflow-y-auto text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
                  {result.character_prompt}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-auto px-6 py-4 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <CreditCoinIcon className="w-3.5 h-3.5" />
            {generating ? (
              <span>Generating…</span>
            ) : loadingBalance ? (
              <span>Checking balance…</span>
            ) : result ? (
              <span>{result.credits_spent} credits spent · {result.credits_remaining} remaining</span>
            ) : (
              <span className={insufficientCredits ? "text-red-600 dark:text-red-400" : ""}>
                {balance !== null ? `${balance} credits available` : ""}
              </span>
            )}
          </div>

          {generating ? null : !result ? (
            <button
              type="submit"
              form="generate-character-form"
              disabled={loadingBalance || insufficientCredits || overWordLimit}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Generate{proMode ? " with Pro" : ""}
              <span className="flex items-center gap-1 pl-2 ml-0.5 border-l border-white/30 text-indigo-100">
                <CreditCoinIcon className="w-3.5 h-3.5" />
                {creditCost}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleReject}
                disabled={accepting}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Reject &amp; Retry
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md shadow-emerald-200 dark:shadow-emerald-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                Accept &amp; Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GenerateCharacterSheetPopUp;
