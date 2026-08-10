"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Check,
  Clapperboard,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  Plus,
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
  videoAspectRatio?: string | null;
  onUpdated: (scene: Scene) => void;
  onDeleted: (sceneId: string) => void;
  onInserted: (scenes: Scene[]) => void;
}

type PromptTab = "image" | "animation";

const textareaClass =
  "w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all resize-none";

export const SceneCard = ({
  scene,
  projectCharacters,
  videoAspectRatio,
  onUpdated,
  onDeleted,
  onInserted,
}: SceneCardProps) => {
  const { setBalance } = useCreditBalance();

  const is916 = videoAspectRatio === "9:16";
  const previewAspectClass = is916 ? "aspect-[9/16]" : "aspect-video";
  const previewMaxWidthClass = is916 ? "max-w-[240px]" : "max-w-[400px]";

  const [text, setText] = useState(scene.scene_text);
  const [imagePrompt, setImagePrompt] = useState(scene.scene_image_prompt ?? "");
  const [animationPrompt, setAnimationPrompt] = useState(scene.scene_animation_prompt ?? "");
  const [activeTab, setActiveTab] = useState<PromptTab>("image");

  const [savingField, setSavingField] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inserting, setInserting] = useState<"above" | "below" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingAnimation, setGeneratingAnimation] = useState(false);
  const imageAbortRef = useRef<AbortController | null>(null);
  const animationAbortRef = useRef<AbortController | null>(null);

  const [charPopoverOpen, setCharPopoverOpen] = useState(false);
  const charButtonRef = useRef<HTMLButtonElement | null>(null);
  const [charPopoverPos, setCharPopoverPos] = useState({ top: 0, left: 0 });

  const persist = async (overrides: {
    scene_text?: string;
    scene_image_prompt?: string;
    scene_animation_prompt?: string;
    involved_character_ids?: string[];
  }) => {
    setSavingField(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/scenes/update/${scene.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_text: (overrides.scene_text ?? text).trim() || scene.scene_text,
          scene_image_prompt: (overrides.scene_image_prompt ?? imagePrompt).trim() || null,
          scene_animation_prompt: (overrides.scene_animation_prompt ?? animationPrompt).trim() || null,
          involved_character_ids:
            overrides.involved_character_ids ?? scene.involved_characters.map((c) => c.id),
        }),
      });
      const data: Scene = await res.json();
      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scene.");
    } finally {
      setSavingField(false);
    }
  };

  const handleTextBlur = () => {
    if (text.trim() && text.trim() !== scene.scene_text) persist({ scene_text: text });
  };
  const handleImagePromptBlur = () => {
    if (imagePrompt.trim() !== (scene.scene_image_prompt ?? "")) persist({ scene_image_prompt: imagePrompt });
  };
  const handleAnimationPromptBlur = () => {
    if (animationPrompt.trim() !== (scene.scene_animation_prompt ?? ""))
      persist({ scene_animation_prompt: animationPrompt });
  };

  const toggleCharacter = (id: string) => {
    const current = new Set(scene.involved_characters.map((c) => c.id));
    if (current.has(id)) current.delete(id);
    else current.add(id);
    persist({ involved_character_ids: Array.from(current) });
  };

  const openCharPopover = () => {
    const rect = charButtonRef.current?.getBoundingClientRect();
    if (rect) setCharPopoverPos({ top: rect.bottom + 6, left: rect.left });
    setCharPopoverOpen((v) => !v);
  };

  const getExtension = (url: string, fallback: string) => {
    const match = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1] : fallback;
  };

  const downloadAsset = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Couldn't download the file — the hosting link may be unavailable.");
    }
  };

  const copyToClipboard = async (key: string, value: string) => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access.");
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

  const handleInsert = async (direction: "above" | "below") => {
    setInserting(direction);
    setError(null);
    try {
      const res = await authFetch("/projects/scenes/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: scene.project_id, reference_scene_id: scene.id, direction }),
      });
      const data: Scene[] = await res.json();
      onInserted(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add scene.");
    } finally {
      setInserting(null);
    }
  };

  const handleGenerateImage = async () => {
    if (imagePrompt.trim() !== (scene.scene_image_prompt ?? "")) {
      await persist({ scene_image_prompt: imagePrompt });
    }
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
    if (animationPrompt.trim() !== (scene.scene_animation_prompt ?? "")) {
      await persist({ scene_animation_prompt: animationPrompt });
    }
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

  const activePromptValue = activeTab === "image" ? imagePrompt : animationPrompt;
  const handleActivePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeTab === "image") setImagePrompt(e.target.value);
    else setAnimationPrompt(e.target.value);
  };
  const handleActivePromptBlur = () => {
    if (activeTab === "image") handleImagePromptBlur();
    else handleAnimationPromptBlur();
  };

  const tabButtonClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
      active
        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
    }`;

  const iconCopyButtonClass =
    "p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  const labeledCopyButtonClass =
    "flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 pb-3 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30 tabular-nums">
            Scene #{scene.scene_number}
          </span>
          <button
            ref={charButtonRef}
            onClick={openCharPopover}
            aria-label="Add or remove involved characters"
            title="Add or remove involved characters"
            className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          {savingField && <Loader2 className="w-3 h-3 animate-spin" />}
          {savingField ? "Saving…" : "Auto-saved"}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className={`grid grid-cols-1 gap-3 ${is916 ? "lg:grid-cols-[1fr_520px]" : "lg:grid-cols-[1fr_440px]"}`}>
          {/* Left: characters + scene text + tabbed prompt editor + insert/delete controls */}
          <div className="flex flex-col gap-3 min-w-0">
            {scene.involved_characters.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                {scene.involved_characters.map((c) => (
                  <span
                    key={c.id}
                    className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30"
                  >
                    {c.name}
                    <button
                      onClick={() => toggleCharacter(c.id)}
                      aria-label={`Remove ${c.name} from this scene`}
                      className="p-0.5 rounded-full hover:bg-indigo-200/60 dark:hover:bg-indigo-500/30 cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Scene Text
                </label>
                <button
                  onClick={() => copyToClipboard("scene_text", text)}
                  className={iconCopyButtonClass}
                  disabled={!text.trim()}
                  aria-label="Copy scene text"
                  title="Copy scene text"
                >
                  {copied === "scene_text" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleTextBlur}
                rows={2}
                className={`${textareaClass} text-[14.5px]`}
              />
            </div>

            <div className="flex flex-col gap-2 lg:flex-1 lg:min-h-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                  <button onClick={() => setActiveTab("image")} className={tabButtonClass(activeTab === "image")}>
                    <ImageIcon className="w-3.5 h-3.5" />
                    Image
                  </button>
                  <button onClick={() => setActiveTab("animation")} className={tabButtonClass(activeTab === "animation")}>
                    <Clapperboard className="w-3.5 h-3.5" />
                    Animation
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyToClipboard("image", imagePrompt)}
                    className={labeledCopyButtonClass}
                    disabled={!imagePrompt.trim()}
                    aria-label="Copy image prompt"
                    title="Copy image prompt"
                  >
                    {copied === "image" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    Image
                  </button>
                  <button
                    onClick={() => copyToClipboard("animation", animationPrompt)}
                    className={labeledCopyButtonClass}
                    disabled={!animationPrompt.trim()}
                    aria-label="Copy animation prompt"
                    title="Copy animation prompt"
                  >
                    {copied === "animation" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    Anim
                  </button>
                </div>
              </div>
              <textarea
                value={activePromptValue}
                onChange={handleActivePromptChange}
                onBlur={handleActivePromptBlur}
                placeholder={
                  activeTab === "image"
                    ? "Describe this scene's image…"
                    : "Describe how this scene's image should animate…"
                }
                rows={5}
                className={`${textareaClass} text-[14px] lg:flex-1 lg:min-h-0`}
              />
            </div>

            <div className="flex items-center justify-between pt-2 mt-auto border-t border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleInsert("above")}
                  disabled={inserting !== null}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60"
                >
                  {inserting === "above" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Above
                </button>
                <button
                  onClick={() => handleInsert("below")}
                  disabled={inserting !== null}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg transition-all cursor-pointer disabled:opacity-60"
                >
                  {inserting === "below" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Below
                </button>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all cursor-pointer disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>

          {/* Right: image + animation previews, aspect-ratio matched to the project's style template */}
          <div className={`flex gap-3 ${is916 ? "flex-row" : "flex-col"}`}>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Image
                </span>
                <div className="flex items-center gap-0.5">
                  {generatingImage ? (
                    <button
                      onClick={() => imageAbortRef.current?.abort()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={handleGenerateImage}
                      disabled={!imagePrompt.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {scene.generated_image_url ? "Regenerate" : "Generate"}
                    </button>
                  )}
                </div>
              </div>
              <div
                className={`relative w-full ${previewMaxWidthClass} mx-auto ${previewAspectClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center`}
              >
                {scene.generated_image_url ? (
                  <>
                    <Image
                      src={scene.generated_image_url}
                      alt={`Scene ${scene.scene_number}`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        downloadAsset(
                          scene.generated_image_url!,
                          `scene_${scene.scene_number}_image.${getExtension(scene.generated_image_url!, "png")}`
                        )
                      }
                      aria-label="Download image"
                      title="Download image"
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Animation
                </span>
                <div className="flex items-center gap-0.5">
                  {generatingAnimation ? (
                    <button
                      onClick={() => animationAbortRef.current?.abort()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={handleGenerateAnimation}
                      disabled={!scene.generated_image_url || !animationPrompt.trim()}
                      title={!scene.generated_image_url ? "Generate the scene's image first" : undefined}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {scene.generated_animation_url ? "Regenerate" : "Generate"}
                    </button>
                  )}
                </div>
              </div>
              <div
                className={`relative w-full ${previewMaxWidthClass} mx-auto ${previewAspectClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center`}
              >
                {scene.generated_animation_url ? (
                  <>
                    <video src={scene.generated_animation_url} controls className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        downloadAsset(
                          scene.generated_animation_url!,
                          `scene_${scene.scene_number}_animation.${getExtension(scene.generated_animation_url!, "mp4")}`
                        )
                      }
                      aria-label="Download animation"
                      title="Download animation"
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <Clapperboard className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {charPopoverOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCharPopoverOpen(false)} />
            <div
              className="fixed z-50 w-64 max-h-80 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-2"
              style={{ top: charPopoverPos.top, left: charPopoverPos.left }}
            >
              <p className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Involved Characters
              </p>
              {projectCharacters.length === 0 ? (
                <p className="px-2 py-2 text-[12.5px] text-slate-400 dark:text-slate-500">
                  Import characters into this project first.
                </p>
              ) : (
                projectCharacters.map((c) => {
                  const involved = scene.involved_characters.some((ic) => ic.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCharacter(c.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 text-left cursor-pointer"
                    >
                      <span
                        className={`w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border ${
                          involved
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {involved && <Check className="w-3 h-3" />}
                      </span>
                      <span className="relative w-6 h-6 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0">
                        <Image
                          src={c.snapshot_character_sheet_url}
                          alt={c.snapshot_name}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </span>
                      <span className="text-[13px] text-slate-700 dark:text-slate-200 truncate">
                        {c.snapshot_name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export default SceneCard;
