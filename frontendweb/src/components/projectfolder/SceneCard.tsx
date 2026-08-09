"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  Clapperboard,
  ImageIcon,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { authFetch } from "@/lib/api";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import type { Scene } from "@/types/scene";
import type { ProjectCharacter } from "@/types/project";

interface SceneCardProps {
  scene: Scene;
  projectCharacters: ProjectCharacter[];
  onUpdated: (scene: Scene) => void;
  onDeleted: (sceneId: string) => void;
}

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all";

export const SceneCard = ({ scene, projectCharacters, onUpdated, onDeleted }: SceneCardProps) => {
  const { setBalance } = useCreditBalance();

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(scene.scene_text);
  const [editImagePrompt, setEditImagePrompt] = useState(scene.scene_image_prompt ?? "");
  const [editAnimationPrompt, setEditAnimationPrompt] = useState(scene.scene_animation_prompt ?? "");
  const [editCharacterIds, setEditCharacterIds] = useState<Set<string>>(
    new Set(scene.involved_characters.map((c) => c.id))
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingAnimation, setGeneratingAnimation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageAbortRef = useRef<AbortController | null>(null);
  const animationAbortRef = useRef<AbortController | null>(null);

  const startEditing = () => {
    setEditText(scene.scene_text);
    setEditImagePrompt(scene.scene_image_prompt ?? "");
    setEditAnimationPrompt(scene.scene_animation_prompt ?? "");
    setEditCharacterIds(new Set(scene.involved_characters.map((c) => c.id)));
    setEditing(true);
  };

  const toggleEditCharacter = (id: string) => {
    setEditCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/scenes/update/${scene.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_text: editText.trim(),
          scene_image_prompt: editImagePrompt.trim() || null,
          scene_animation_prompt: editAnimationPrompt.trim() || null,
          involved_character_ids: Array.from(editCharacterIds),
        }),
      });
      const data: Scene = await res.json();
      onUpdated(data);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scene.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await authFetch(`/projects/scenes/delete/${scene.id}`, { method: "DELETE" });
      onDeleted(scene.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete scene.");
      setDeleting(false);
    }
  };

  const handleGenerateImage = async () => {
    const controller = new AbortController();
    imageAbortRef.current = controller;
    setGeneratingImage(true);
    setError(null);
    try {
      const res = await authFetch("/projects/image/generate_and_save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: scene.id }),
        signal: controller.signal,
      });
      const data = await res.json();
      onUpdated(data.scene);
      setBalance(data.credits_remaining);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Failed to generate image.");
      }
    } finally {
      setGeneratingImage(false);
      imageAbortRef.current = null;
    }
  };

  const handleGenerateAnimation = async () => {
    const controller = new AbortController();
    animationAbortRef.current = controller;
    setGeneratingAnimation(true);
    setError(null);
    try {
      const res = await authFetch("/projects/animation/generate_and_save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: scene.id }),
        signal: controller.signal,
      });
      const data = await res.json();
      onUpdated(data.scene);
      setBalance(data.credits_remaining);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Failed to generate animation.");
      }
    } finally {
      setGeneratingAnimation(false);
      animationAbortRef.current = null;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 pb-3 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30 tabular-nums">
            Scene #{scene.scene_number}
          </span>
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={startEditing}
              aria-label="Edit scene"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete scene"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        {editing ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Scene Text
              </label>
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Image Prompt
              </label>
              <textarea value={editImagePrompt} onChange={(e) => setEditImagePrompt(e.target.value)} rows={2} className={`${inputClass} resize-none text-[13px]`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                Animation Prompt
              </label>
              <textarea value={editAnimationPrompt} onChange={(e) => setEditAnimationPrompt(e.target.value)} rows={2} className={`${inputClass} resize-none text-[13px]`} />
            </div>
            {projectCharacters.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Involved Characters
                </label>
                <div className="flex flex-wrap gap-2">
                  {projectCharacters.map((c) => {
                    const selected = editCharacterIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleEditCharacter(c.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all cursor-pointer ${
                          selected
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        {c.snapshot_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !editText.trim()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 transition-all active:scale-95 cursor-pointer disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5">
              {scene.scene_text}
            </p>

            {scene.involved_characters.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                {scene.involved_characters.map((c) => (
                  <span
                    key={c.id}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Image */}
              <div className="flex flex-col gap-2">
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center">
                  {scene.generated_image_url ? (
                    <Image src={scene.generated_image_url} alt={`Scene ${scene.scene_number}`} fill unoptimized className="object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                {generatingImage ? (
                  <button
                    onClick={() => imageAbortRef.current?.abort()}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating… Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateImage}
                    disabled={!scene.scene_image_prompt}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {scene.generated_image_url ? "Regenerate Image" : "Generate Image"}
                  </button>
                )}
              </div>

              {/* Animation */}
              <div className="flex flex-col gap-2">
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center">
                  {scene.generated_animation_url ? (
                    <video src={scene.generated_animation_url} controls className="w-full h-full object-cover" />
                  ) : (
                    <Clapperboard className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                {generatingAnimation ? (
                  <button
                    onClick={() => animationAbortRef.current?.abort()}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Generating… Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAnimation}
                    disabled={!scene.generated_image_url}
                    title={!scene.generated_image_url ? "Generate the scene's image first" : undefined}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {scene.generated_animation_url ? "Regenerate Animation" : "Generate Animation"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
};

export default SceneCard;
