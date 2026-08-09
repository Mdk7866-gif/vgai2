"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Save, Settings, Check } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { AnimationModelTier, ImageModelTier, LlmModelTier, Project } from "@/types/project";
import CreditCoinIcon from "@/components/CreditCoinIcon";

interface AdvancedSettingsPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentLlmModelId: LlmModelTier;
  currentImageModelId: ImageModelTier;
  currentAnimationModelId: AnimationModelTier;
  onSaved: (project: Project) => void;
}

const LLM_OPTIONS: { id: LlmModelTier; label: string; description: string }[] = [
  { id: "base", label: "Base", description: "GPT — fast, reliable scene-splitting for most scripts." },
  { id: "pro", label: "Pro", description: "Gemini 3 Pro — stronger reasoning for long or complex scripts." },
];

const IMAGE_OPTIONS: { id: ImageModelTier; label: string; description: string; cost: number }[] = [
  { id: "base", label: "Base", description: "gpt-image-2, low quality.", cost: 4 },
  { id: "pro", label: "Pro", description: "gpt-image-2, high quality.", cost: 20 },
];

const ANIMATION_OPTIONS: { id: AnimationModelTier; label: string; description: string; cost: number }[] = [
  { id: "base", label: "Base", description: "Wan 2.6, image-to-video, ~5s clip.", cost: 20 },
  { id: "pro", label: "Pro", description: "Veo 3.1 Lite, image-to-video, ~6s clip.", cost: 40 },
];

function OptionCard({
  selected,
  onClick,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left flex items-start justify-between gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
        selected
          ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10"
          : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50"
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-[14px] text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {badge}
        {selected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
      </div>
    </button>
  );
}

export const AdvancedSettingsPopUp = ({
  isOpen,
  onClose,
  projectId,
  currentLlmModelId,
  currentImageModelId,
  currentAnimationModelId,
  onSaved,
}: AdvancedSettingsPopUpProps) => {
  const [llmModelId, setLlmModelId] = useState<LlmModelTier>(currentLlmModelId);
  const [imageModelId, setImageModelId] = useState<ImageModelTier>(currentImageModelId);
  const [animationModelId, setAnimationModelId] = useState<AnimationModelTier>(currentAnimationModelId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/update/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_model_id: llmModelId,
          image_model_id: imageModelId,
          animation_model_id: animationModelId,
        }),
      });
      const data: Project = await res.json();
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" onClick={() => !saving && onClose()} />

      <div className="relative w-full sm:max-w-lg overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-800/95 shadow-2xl dark:shadow-slate-950/80 ring-1 ring-slate-200/80 dark:ring-slate-700/60 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Advanced Settings</h2>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
              Text Model — scene splitting & metadata
            </h3>
            <div className="flex flex-col gap-2.5">
              {LLM_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={llmModelId === opt.id}
                  onClick={() => setLlmModelId(opt.id)}
                  title={opt.label}
                  description={opt.description}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
              Image Model — scene & thumbnail images
            </h3>
            <div className="flex flex-col gap-2.5">
              {IMAGE_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={imageModelId === opt.id}
                  onClick={() => setImageModelId(opt.id)}
                  title={opt.label}
                  description={opt.description}
                  badge={
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/30">
                      <CreditCoinIcon className="w-3 h-3" />
                      {opt.cost}
                    </span>
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
              Animation Model — scene animation
            </h3>
            <div className="flex flex-col gap-2.5">
              {ANIMATION_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={animationModelId === opt.id}
                  onClick={() => setAnimationModelId(opt.id)}
                  title={opt.label}
                  description={opt.description}
                  badge={
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/30">
                      <CreditCoinIcon className="w-3 h-3" />
                      {opt.cost}
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdvancedSettingsPopUp;
