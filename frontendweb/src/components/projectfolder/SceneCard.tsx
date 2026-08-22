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
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { authFetch } from "@/lib/api";
import { PROMPT_REWRITE_CREDIT_COST, animationCreditCost, imageCreditCost } from "@/lib/credits";
import { AssetUnavailableError, downloadAsset, getFileExtension } from "@/lib/download";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";
import VideoPlayingCardPopUp from "@/components/VideoPlayingCardPopUp";
import type { Scene } from "@/types/scene";
import type { ProjectCharacter } from "@/types/project";

interface SceneCardProps {
  scene: Scene;
  projectCharacters: ProjectCharacter[];
  videoAspectRatio?: string | null;
  /** The project's model tiers, used only to know what a generation costs so the
   * shared balance can drop as soon as it starts. */
  imageModelId?: string | null;
  animationModelId?: string | null;
  onUpdated: (scene: Scene) => void;
  onDeleted: (sceneId: string) => void;
  onInserted: (scenes: Scene[]) => void;
  /** Shared image-generation concurrency cap (page-owned, see project_folder's
   * page.tsx) — "Generate All Images (Automatic)" and every SceneCard's own
   * Generate button draw from the same pool of slots, so the two can't together
   * exceed the limit and trip an image-provider rate limit. */
  onAcquireImageSlot: () => boolean;
  onReleaseImageSlot: () => void;
  onImageConcurrencyLimitReached: () => void;
}

type PromptTab = "image" | "animation";

const textareaClass =
  "w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all resize-none";

export const SceneCard = ({
  scene,
  projectCharacters,
  videoAspectRatio,
  imageModelId,
  animationModelId,
  onUpdated,
  onDeleted,
  onInserted,
  onAcquireImageSlot,
  onReleaseImageSlot,
  onImageConcurrencyLimitReached,
}: SceneCardProps) => {
  const { setBalance, reserveBalance, refreshBalance } = useCreditBalance();

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

  // Manual upload (drag-and-drop or click-to-browse) of an image/animation the
  // user produced outside vgAI — a pure convenience path, no credits, no AI
  // call. See the backend's upload_scene_image/upload_scene_animation.
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAnimation, setUploadingAnimation] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [animationDragOver, setAnimationDragOver] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const animationFileInputRef = useRef<HTMLInputElement | null>(null);
  // Holds a file that would replace an existing image/animation until the user
  // acknowledges the AlertMessagePopUp warning that the previous one gets
  // permanently deleted (from Cloudinary too, not just this scene's row).
  const [pendingReplacement, setPendingReplacement] = useState<{ kind: "image" | "animation"; file: File } | null>(
    null
  );
  const [deletingImage, setDeletingImage] = useState(false);
  const [deletingAnimation, setDeletingAnimation] = useState(false);
  const [deleteAssetConfirm, setDeleteAssetConfirm] = useState<"image" | "animation" | null>(null);

  // Offered after a hand-edited image prompt is saved — syncing the animation
  // prompt to match is opt-in (costs a credit) rather than automatic. Suppressed
  // when the blur that triggers it was actually caused by clicking Generate/
  // Regenerate/Upload, which already handle prompt consistency themselves.
  const [syncAnimationConfirmOpen, setSyncAnimationConfirmOpen] = useState(false);
  const [syncingAnimation, setSyncingAnimation] = useState(false);
  const suppressPromptSyncRef = useRef(false);

  const [charPopoverOpen, setCharPopoverOpen] = useState(false);
  const charButtonRef = useRef<HTMLButtonElement | null>(null);
  const [charPopoverPos, setCharPopoverPos] = useState({ top: 0, left: 0 });

  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const [videoPopupOpen, setVideoPopupOpen] = useState(false);
  // "done" is sticky for the rest of the session (a page reload clears it) so the
  // user keeps a visible record of what they've already saved locally.
  const [downloadStatus, setDownloadStatus] = useState<Record<string, "loading" | "done">>({});

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
  const handleImagePromptBlur = async () => {
    const trimmed = imagePrompt.trim();
    if (trimmed === (scene.scene_image_prompt ?? "")) return;
    await persist({ scene_image_prompt: imagePrompt });
    if (suppressPromptSyncRef.current) {
      suppressPromptSyncRef.current = false;
      return;
    }
    if (trimmed) setSyncAnimationConfirmOpen(true);
  };

  const handleConfirmSyncAnimationPrompt = async () => {
    setSyncingAnimation(true);
    setError(null);
    reserveBalance(PROMPT_REWRITE_CREDIT_COST);
    try {
      const res = await authFetch("/projects/image/sync_animation_prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: scene.id }),
      });
      const data = await res.json();
      setAnimationPrompt(data.scene.scene_animation_prompt ?? "");
      onUpdated(data.scene);
      setBalance(data.credits_remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the animation prompt.");
      void refreshBalance();
    } finally {
      setSyncingAnimation(false);
      setSyncAnimationConfirmOpen(false);
    }
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

  const handleDownload = async (key: string, url: string, filename: string) => {
    setDownloadStatus((s) => ({ ...s, [key]: "loading" }));
    setError(null);
    try {
      await downloadAsset(url, filename);
      setDownloadStatus((s) => ({ ...s, [key]: "done" }));
    } catch (err) {
      setDownloadStatus((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
      setError(
        err instanceof AssetUnavailableError
          ? `Couldn't download — the media host refused the file (HTTP ${err.status}).`
          : "Couldn't download — the file couldn't be reached."
      );
    }
  };

  const downloadButtonIcon = (key: string) =>
    downloadStatus[key] === "loading" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : downloadStatus[key] === "done" ? (
      <Check className="w-3.5 h-3.5" />
    ) : (
      <Download className="w-3.5 h-3.5" />
    );

  const downloadButtonClass = (key: string) =>
    `absolute top-1.5 right-1.5 p-1.5 rounded-lg text-white transition-colors cursor-pointer ${
      downloadStatus[key] === "done" ? "bg-emerald-600/90 hover:bg-emerald-600" : "bg-black/50 hover:bg-black/70"
    }`;

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

  /** Tells the backend to drop this scene's in-flight generation. Credits are not
   * returned — they were reserved before the provider was called and the provider
   * bills us either way — but clearing the generation token means the abandoned
   * result gets discarded instead of landing on top of whatever the user does
   * next, which is normally editing the prompt and generating again. */
  const cancelGeneration = async (kind: "image" | "animation") => {
    try {
      const res = await authFetch("/projects/scenes/cancel_generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: scene.id, kind }),
      });
      onUpdated(await res.json());
    } catch {
      // Best-effort: the local abort already stopped the UI waiting. A failed
      // cancel only risks the stale result still being saved.
    }
    // The reservation stands, so re-read rather than adding the cost back.
    void refreshBalance();
  };

  const handleGenerateImage = async () => {
    if (!onAcquireImageSlot()) {
      onImageConcurrencyLimitReached();
      return;
    }
    suppressPromptSyncRef.current = true;
    if (imagePrompt.trim() !== (scene.scene_image_prompt ?? "")) {
      await persist({ scene_image_prompt: imagePrompt });
    }
    // Once an image already exists, "Regenerate" doesn't resubmit the same
    // prompt that already produced a disliked result — the backend rewrites
    // both the image and animation prompts first (1 credit), then generates
    // from the rewritten prompt. A first-time Generate is unaffected.
    const isRegenerate = Boolean(scene.generated_image_url);
    const controller = new AbortController();
    imageAbortRef.current = controller;
    setGeneratingImage(true);
    setError(null);
    // Mirror the backend reserving the cost up front, so the balance reflects
    // money already committed rather than only updating if this call succeeds.
    const cost = imageCreditCost(imageModelId) + (isRegenerate ? PROMPT_REWRITE_CREDIT_COST : 0);
    reserveBalance(cost);
    try {
      const res = await authFetch(
        isRegenerate ? "/projects/image/regenerate_and_save" : "/projects/image/generate_and_save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene_id: scene.id }),
          signal: controller.signal,
        }
      );
      const data = await res.json();
      setImagePrompt(data.scene.scene_image_prompt ?? "");
      setAnimationPrompt(data.scene.scene_animation_prompt ?? "");
      onUpdated(data.scene);
      setBalance(data.credits_remaining);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Failed to generate image.");
        // Could be a refunded failure or a rejection before anything was
        // reserved — only the backend knows which.
        void refreshBalance();
      }
    } finally {
      setGeneratingImage(false);
      imageAbortRef.current = null;
      onReleaseImageSlot();
    }
  };

  const handleCancelImage = () => {
    imageAbortRef.current?.abort();
    void cancelGeneration("image");
  };

  const handleGenerateAnimation = async () => {
    if (animationPrompt.trim() !== (scene.scene_animation_prompt ?? "")) {
      await persist({ scene_animation_prompt: animationPrompt });
    }
    const controller = new AbortController();
    animationAbortRef.current = controller;
    setGeneratingAnimation(true);
    setError(null);
    reserveBalance(animationCreditCost(animationModelId));
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
        void refreshBalance();
      }
    } finally {
      setGeneratingAnimation(false);
      animationAbortRef.current = null;
    }
  };

  const handleCancelAnimation = () => {
    animationAbortRef.current?.abort();
    void cancelGeneration("animation");
  };

  const uploadImageFile = async (file: File) => {
    setUploadingImage(true);
    setError(null);
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await authFetch(`/projects/scenes/${scene.id}/upload_image`, {
        method: "POST",
        body: formData,
      });
      onUpdated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadAnimationFile = async (file: File) => {
    setUploadingAnimation(true);
    setError(null);
    const formData = new FormData();
    formData.append("animation", file);
    try {
      const res = await authFetch(`/projects/scenes/${scene.id}/upload_animation`, {
        method: "POST",
        body: formData,
      });
      onUpdated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload animation.");
    } finally {
      setUploadingAnimation(false);
    }
  };

  /** Routes a newly picked/dropped file either straight to upload, or — when it
   * would replace an existing asset — through the AlertMessagePopUp warning
   * first. The upload itself fires once that warning is acknowledged. */
  const selectImageFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (scene.generated_image_url) {
      setPendingReplacement({ kind: "image", file });
    } else {
      void uploadImageFile(file);
    }
  };

  const selectAnimationFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    if (scene.generated_animation_url) {
      setPendingReplacement({ kind: "animation", file });
    } else {
      void uploadAnimationFile(file);
    }
  };

  const handleAcknowledgeReplacement = () => {
    if (!pendingReplacement) return;
    const { kind, file } = pendingReplacement;
    setPendingReplacement(null);
    if (kind === "image") void uploadImageFile(file);
    else void uploadAnimationFile(file);
  };

  const makeDropHandlers = (kind: "image" | "animation") => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (kind === "image" ? !uploadingImage : !uploadingAnimation) {
        (kind === "image" ? setImageDragOver : setAnimationDragOver)(true);
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      (kind === "image" ? setImageDragOver : setAnimationDragOver)(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      (kind === "image" ? setImageDragOver : setAnimationDragOver)(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (kind === "image") selectImageFile(file);
      else selectAnimationFile(file);
    },
  });

  const imageDropHandlers = makeDropHandlers("image");
  const animationDropHandlers = makeDropHandlers("animation");

  const handleDeleteImage = async () => {
    setDeletingImage(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/scenes/${scene.id}/image`, { method: "DELETE" });
      onUpdated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image.");
    } finally {
      setDeletingImage(false);
      setDeleteAssetConfirm(null);
    }
  };

  const handleDeleteAnimation = async () => {
    setDeletingAnimation(true);
    setError(null);
    try {
      const res = await authFetch(`/projects/scenes/${scene.id}/animation`, { method: "DELETE" });
      onUpdated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete animation.");
    } finally {
      setDeletingAnimation(false);
      setDeleteAssetConfirm(null);
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
                      onClick={handleCancelImage}
                      title="Discard this image. Credits for it have already been charged."
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Cancel
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleGenerateImage}
                        disabled={!imagePrompt.trim() || uploadingImage || syncingAnimation}
                        title={
                          scene.generated_image_url
                            ? `Rewrites the image & animation prompts with AI (+${PROMPT_REWRITE_CREDIT_COST} credit) and generates a fresh image from them`
                            : undefined
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {scene.generated_image_url ? "Regenerate" : "Generate"}
                      </button>
                      <button
                        onClick={() => {
                          suppressPromptSyncRef.current = true;
                          imageFileInputRef.current?.click();
                        }}
                        disabled={uploadingImage}
                        title="Upload an image you generated elsewhere"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-900/60 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploadingImage ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        Upload
                      </button>
                    </>
                  )}
                </div>
              </div>
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  selectImageFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <div
                onClick={() => scene.generated_image_url && !imageDragOver && setImageZoomOpen(true)}
                {...imageDropHandlers}
                className={`relative w-full ${previewMaxWidthClass} mx-auto ${previewAspectClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border-2 flex items-center justify-center transition-colors ${
                  scene.generated_image_url ? "cursor-zoom-in" : ""
                } ${
                  imageDragOver
                    ? "border-dashed border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                    : "border-slate-200 dark:border-slate-700/60"
                }`}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(
                          "image",
                          scene.generated_image_url!,
                          `scene_${scene.scene_number}.${getFileExtension(scene.generated_image_url!, "png")}`
                        );
                      }}
                      aria-label="Download image"
                      title="Download image"
                      className={downloadButtonClass("image")}
                    >
                      {downloadButtonIcon("image")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteAssetConfirm("image");
                      }}
                      disabled={deletingImage}
                      aria-label="Delete image"
                      title="Delete image"
                      className="absolute top-1.5 right-9 p-1.5 rounded-lg text-white bg-black/50 hover:bg-red-600/90 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                ) : imageDragOver ? (
                  <span className="flex flex-col items-center gap-1 text-indigo-500 dark:text-indigo-400 text-[11px] font-medium px-2 text-center">
                    <Upload className="w-6 h-6" />
                    Drop image here
                  </span>
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
                      onClick={handleCancelAnimation}
                      title="Discard this animation. Credits for it have already been charged."
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleGenerateAnimation}
                        disabled={
                          !scene.generated_image_url || !animationPrompt.trim() || uploadingAnimation || syncingAnimation
                        }
                        title={!scene.generated_image_url ? "Generate the scene's image first" : undefined}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {scene.generated_animation_url ? "Regenerate" : "Generate"}
                      </button>
                      <button
                        onClick={() => animationFileInputRef.current?.click()}
                        disabled={uploadingAnimation}
                        title="Upload an animation you generated elsewhere"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 bg-slate-100 dark:bg-slate-900/60 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploadingAnimation ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        Upload
                      </button>
                    </>
                  )}
                </div>
              </div>
              <input
                ref={animationFileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  selectAnimationFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <div
                onClick={() => scene.generated_animation_url && !animationDragOver && setVideoPopupOpen(true)}
                {...animationDropHandlers}
                className={`relative w-full ${previewMaxWidthClass} mx-auto ${previewAspectClass} rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border-2 flex items-center justify-center transition-colors ${
                  scene.generated_animation_url ? "cursor-pointer" : ""
                } ${
                  animationDragOver
                    ? "border-dashed border-violet-500 bg-violet-50 dark:bg-violet-500/10"
                    : "border-slate-200 dark:border-slate-700/60"
                }`}
              >
                {scene.generated_animation_url ? (
                  <>
                    <video
                      src={scene.generated_animation_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(
                          "animation",
                          scene.generated_animation_url!,
                          `scene_${scene.scene_number}.${getFileExtension(scene.generated_animation_url!, "mp4")}`
                        );
                      }}
                      aria-label="Download animation"
                      title="Download animation"
                      className={downloadButtonClass("animation")}
                    >
                      {downloadButtonIcon("animation")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteAssetConfirm("animation");
                      }}
                      disabled={deletingAnimation}
                      aria-label="Delete animation"
                      title="Delete animation"
                      className="absolute top-1.5 right-9 p-1.5 rounded-lg text-white bg-black/50 hover:bg-red-600/90 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingAnimation ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </>
                ) : animationDragOver ? (
                  <span className="flex flex-col items-center gap-1 text-violet-500 dark:text-violet-400 text-[11px] font-medium px-2 text-center">
                    <Upload className="w-6 h-6" />
                    Drop video here
                  </span>
                ) : (
                  <Clapperboard className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {scene.generated_image_url && (
        <ImageZoomPopUp
          isOpen={imageZoomOpen}
          onClose={() => setImageZoomOpen(false)}
          imageUrl={scene.generated_image_url}
          alt={`Scene ${scene.scene_number}`}
        />
      )}

      {scene.generated_animation_url && (
        <VideoPlayingCardPopUp
          isOpen={videoPopupOpen}
          onClose={() => setVideoPopupOpen(false)}
          videoUrl={scene.generated_animation_url}
          filename={`scene_${scene.scene_number}.${getFileExtension(scene.generated_animation_url, "mp4")}`}
        />
      )}

      <ConformationMessagePopUp
        isOpen={syncAnimationConfirmOpen}
        onClose={() => setSyncAnimationConfirmOpen(false)}
        onConfirm={handleConfirmSyncAnimationPrompt}
        confirming={syncingAnimation}
        title="Update animation prompt to match?"
        message={`You changed this scene's image prompt. Want the animation prompt rewritten with AI to match it too? This costs ${PROMPT_REWRITE_CREDIT_COST} credit.`}
        confirmText="Update Animation Prompt"
        cancelText="Not Now"
      />

      <AlertMessagePopUp
        isOpen={pendingReplacement !== null}
        onClose={handleAcknowledgeReplacement}
        type="warning"
        title={pendingReplacement?.kind === "animation" ? "Replace this animation?" : "Replace this image?"}
        message={`This scene already has a${
          pendingReplacement?.kind === "animation" ? "n animation" : "n image"
        } generated — uploading this file will permanently delete the current one (from Cloudinary too, not just this project) and replace it.`}
      />

      <ConformationMessagePopUp
        isOpen={deleteAssetConfirm !== null}
        onClose={() => setDeleteAssetConfirm(null)}
        onConfirm={deleteAssetConfirm === "animation" ? handleDeleteAnimation : handleDeleteImage}
        isDestructive
        confirming={deleteAssetConfirm === "animation" ? deletingAnimation : deletingImage}
        title={deleteAssetConfirm === "animation" ? "Delete this animation?" : "Delete this image?"}
        message="This permanently removes the file, including from Cloudinary. This can't be undone."
        confirmText="Delete"
      />

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
