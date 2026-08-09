"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Mic, RotateCcw, ChevronDown, Check, Save } from "lucide-react";
import { authFetch } from "@/lib/api";
import type { Project, VoiceoverSettings } from "@/types/project";
import Toggle from "@/components/Toggle";

interface VoiceOverControllerPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  initialSettings: VoiceoverSettings;
  onSaved: (project: Project) => void;
}

const DEFAULT_SETTINGS: VoiceoverSettings = {
  vo_voice_id: "95etAma035P6Ys5iv7Oo",
  vo_model_id: "eleven_multilingual_v2",
  vo_stability: 40,
  vo_similarity: 70,
  vo_style: 30,
  vo_speaker_boost: true,
  vo_speed: 0.88,
};

const VOICES = [
  { id: "95etAma035P6Ys5iv7Oo", label: "Clayton — Easygoing, Natural and Clear" },
  { id: "yl2ZDV1MzN4HbQJbMihG", label: "Alex — Young American Male" },
  { id: "BIvP0GN1cAtSRTxNHnWS", label: "Ellen — Serious, Direct and Confident" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian — Deep, Resonant and Comforting" },
];

const MODELS = [
  { id: "eleven_multilingual_v2", label: "Eleven Multilingual v2", badge: "V2" },
  { id: "eleven_flash_v2_5", label: "Eleven Flash v2.5", badge: "V2.5" },
  { id: "eleven_turbo_v2_5", label: "Eleven v3 (alpha)", badge: "V3" },
];

function Dropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string; badge?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.id === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-left cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected.badge && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-600 text-white flex-shrink-0">
              {selected.badge}
            </span>
          )}
          <span className="text-[13.5px] text-slate-900 dark:text-slate-100 truncate">{selected.label}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-10 mt-1.5 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-1.5">
          {options.map((o) => {
            const isSelected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-[13px] cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/70"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {o.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0 ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                      }`}
                    >
                      {o.badge}
                    </span>
                  )}
                  <span className="truncate">{o.label}</span>
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  leftLabel,
  rightLabel,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  leftLabel: string;
  rightLabel: string;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <span className="text-xs font-semibold text-white bg-indigo-600 px-2 py-0.5 rounded-md tabular-nums">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-600 cursor-pointer"
      />
      <div className="flex items-center justify-between mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

export const VoiceOverControllerPopUp = ({
  isOpen,
  onClose,
  projectId,
  initialSettings,
  onSaved,
}: VoiceOverControllerPopUpProps) => {
  const [voiceId, setVoiceId] = useState(initialSettings.vo_voice_id);
  const [modelId, setModelId] = useState(initialSettings.vo_model_id);
  const [stability, setStability] = useState(initialSettings.vo_stability);
  const [similarity, setSimilarity] = useState(initialSettings.vo_similarity);
  const [style, setStyle] = useState(initialSettings.vo_style);
  const [speakerBoost, setSpeakerBoost] = useState(initialSettings.vo_speaker_boost);
  const [speed, setSpeed] = useState(initialSettings.vo_speed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isV3 = modelId === "eleven_turbo_v2_5";
  const isFlash = modelId === "eleven_flash_v2_5";
  const showSpeed = !isV3;
  const showSimilarity = !isV3;
  const showStyle = !isV3 && !isFlash;
  const showSpeakerBoost = !isV3;

  const handleReset = () => {
    setVoiceId(DEFAULT_SETTINGS.vo_voice_id);
    setModelId(DEFAULT_SETTINGS.vo_model_id);
    setStability(DEFAULT_SETTINGS.vo_stability);
    setSimilarity(DEFAULT_SETTINGS.vo_similarity);
    setStyle(DEFAULT_SETTINGS.vo_style);
    setSpeakerBoost(DEFAULT_SETTINGS.vo_speaker_boost);
    setSpeed(DEFAULT_SETTINGS.vo_speed);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/${projectId}/voiceoversettings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vo_voice_id: voiceId,
          vo_model_id: modelId,
          vo_stability: stability,
          vo_similarity: similarity,
          vo_style: style,
          vo_speaker_boost: speakerBoost,
          vo_speed: speed,
        }),
      });
      const data: Project = await res.json();
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save voiceover settings.");
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
              <Mic className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Voiceover Settings</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure this project&apos;s ElevenLabs voice</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={() => !saving && onClose()}
              className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">
          <Dropdown label="Voice" options={VOICES} value={voiceId} onChange={setVoiceId} />
          <Dropdown label="Model" options={MODELS} value={modelId} onChange={setModelId} />

          {isV3 && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[12px] text-amber-800 dark:text-amber-300 leading-relaxed">
              This model is a research preview — the most expressive option, but needs more prompt engineering.
            </div>
          )}

          <div className="h-px bg-slate-100 dark:bg-slate-700/60" />

          {showSpeed && (
            <Slider
              label="Speed"
              value={speed}
              min={0.7}
              max={1.2}
              step={0.01}
              leftLabel="Slower"
              rightLabel="Faster"
              formatValue={(v) => v.toFixed(2)}
              onChange={setSpeed}
            />
          )}
          <Slider
            label="Stability"
            value={stability}
            min={0}
            max={100}
            step={1}
            leftLabel={isV3 ? "Creative" : "More variable"}
            rightLabel={isV3 ? "Robust" : "More stable"}
            formatValue={(v) => `${v}%`}
            onChange={setStability}
          />
          {showSimilarity && (
            <Slider
              label="Similarity"
              value={similarity}
              min={0}
              max={100}
              step={1}
              leftLabel="Low"
              rightLabel="High"
              formatValue={(v) => `${v}%`}
              onChange={setSimilarity}
            />
          )}
          {showStyle && (
            <Slider
              label="Style Exaggeration"
              value={style}
              min={0}
              max={100}
              step={1}
              leftLabel="None"
              rightLabel="Exaggerated"
              formatValue={(v) => `${v}%`}
              onChange={setStyle}
            />
          )}
          {showSpeakerBoost && <Toggle checked={speakerBoost} onChange={setSpeakerBoost} label="Speaker boost" />}
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

export default VoiceOverControllerPopUp;
