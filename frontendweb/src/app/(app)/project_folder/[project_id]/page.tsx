"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Clock,
  ClipboardList,
  Download,
  ImageIcon,
  Loader2,
  Mic,
  Palette,
  Pencil,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import { useProjects } from "@/context/ProjectsContext";
import { authFetch } from "@/lib/api";
import { imageCreditCost } from "@/lib/credits";
import {
  buildDownloadTasks,
  runProjectDownload,
  supportsDirectoryPicker,
  type DownloadProgress as DownloadAllProgress,
} from "@/lib/downloadProject";
import CreditCoinIcon from "@/components/CreditCoinIcon";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ChooseCharacterPopUp from "@/components/projectfolder/ChooseCharacterPopUp";
import ChooseStyleTemplatePopUp from "@/components/projectfolder/ChooseStyleTemplatePopUp";
import VoiceOverControllerPopUp from "@/components/projectfolder/VoiceOverControllerPopUp";
import AdvancedSettingsPopUp from "@/components/projectfolder/AdvancedSettingsPopUp";
import GenerateScenesManualPopUp from "@/components/projectfolder/GenerateScenesManualPopUp";
import ManualImageGenerationPromptCopyPopUp from "@/components/projectfolder/ManualImageGenerationPromptCopyPopUp";
import SceneCard from "@/components/projectfolder/SceneCard";
import VideoMetaDataCard from "@/components/projectfolder/VideoMetaDataCard";
import type { Project, ProjectCharacter } from "@/types/project";
import type {
  Scene,
  GenerateScenesResponse,
  GenerateImagesManualResponse,
  GenerateScenesManualChargeResponse,
} from "@/types/scene";

// Mirrors app/routes/project/scenesplitcommon.py. Manual is 1 credit per 200
// words; Automatic Base is 2x and Automatic Pro is 20x the manual price.
const WORDS_PER_CREDIT_MANUAL = 200;
const WORDS_PER_CREDIT_AUTO_BASE = WORDS_PER_CREDIT_MANUAL / 2;
const AUTOMATIC_PRO_COST_MULTIPLIER = 3;
const BASE_GENERATION_SECONDS_PER_1000_WORDS = 30;
const MAX_SCRIPT_WORDS = 4000;
// Mirrors app/routes/project/imagegeneration.py's SCENES_PER_CREDIT_MANUAL.
const SCENES_PER_CREDIT_MANUAL = 5;

// "Generate All Images (Automatic)" pacing — no backend endpoint governs this,
// it's purely a client-side throttle so a big project doesn't fire 40+ OpenAI
// image calls at once and trip a provider rate limit. Also shared with each
// SceneCard's own Generate button via onAcquireImageSlot/onReleaseImageSlot, so
// the two can't together exceed the cap either.
const MAX_CONCURRENT_IMAGE_GENERATIONS = 5;
const BULK_IMAGE_BATCH_SIZE = 5;
const BULK_IMAGE_BATCH_BREAK_MS = 10_000;
const BULK_IMAGE_MEGA_BREAK_EVERY = 50;
const BULK_IMAGE_MEGA_BREAK_MS = 60_000;
const BULK_IMAGE_MAX_CONSECUTIVE_FAILURES = 5;

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface BulkImageProgress {
  totalScenes: number; // every scene in the project at run start, e.g. 120
  startAlready: number; // scenes that already had a generated image before this run, e.g. 25
  targetCount: number; // scenes this run will actually attempt, e.g. 95
  completed: number; // newly generated so far *this run* — headline count is startAlready + completed
  failed: number;
  cancelled: number;
  batchIndex: number; // 1-based index of the batch currently in flight
  batchCount: number; // total number of batches this run will process
  batchSize: number; // size of the batch currently in flight
  pausingUntil: number | null;
  stopping: boolean;
}

export default function ProjectFolderPage() {
  const params = useParams<{ project_id: string }>();
  const projectId = params.project_id;

  const { requireAuth } = useAuth();
  const { balance, setBalance, reserveBalance, refreshBalance } = useCreditBalance();
  const { renameProject } = useProjects();

  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [projectCharacters, setProjectCharacters] = useState<ProjectCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  const [scriptDraft, setScriptDraft] = useState("");
  const [savingScript, setSavingScript] = useState(false);

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [charactersPopupOpen, setCharactersPopupOpen] = useState(false);
  const [styleTemplatePopupOpen, setStyleTemplatePopupOpen] = useState(false);
  const [voiceoverPopupOpen, setVoiceoverPopupOpen] = useState(false);
  const [advancedSettingsPopupOpen, setAdvancedSettingsPopupOpen] = useState(false);
  const [manualScenesPopupOpen, setManualScenesPopupOpen] = useState(false);
  const [manualImagesPopupOpen, setManualImagesPopupOpen] = useState(false);

  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [chargingManualScenes, setChargingManualScenes] = useState(false);
  const [chargingManualImages, setChargingManualImages] = useState(false);
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    type?: "success" | "error" | "warning" | "info";
  } | null>(null);

  // Shared image-generation concurrency pool — see MAX_CONCURRENT_IMAGE_GENERATIONS.
  const activeImageGenerationsRef = useRef(0);
  const [bulkImageProgress, setBulkImageProgress] = useState<BulkImageProgress | null>(null);
  const bulkImageStopRef = useRef(false);
  // Scene id -> the AbortController for that scene's currently in-flight
  // /generate_and_save call, so Stop can abort exactly what's running right now
  // instead of only preventing new requests from starting.
  const bulkImageInFlightRef = useRef<Map<string, AbortController>>(new Map());
  const [nowTick, setNowTick] = useState(() => Date.now());

  // "Download All" -- see lib/downloadProject.ts for the folder-picker /
  // zip-fallback split. A single AbortController for the whole run (not one
  // per file) both stops new fetches from starting and cancels whatever's
  // currently in flight the moment Stop is clicked.
  const [downloadProgress, setDownloadProgress] = useState<DownloadAllProgress | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  const cancelSceneImageGeneration = useCallback(async (sceneId: string) => {
    try {
      await authFetch("/projects/scenes/cancel_generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: sceneId, kind: "image" }),
      });
    } catch {
      // Best-effort, same as SceneCard's own cancelGeneration — a failed cancel
      // only risks the abandoned result still being saved server-side.
    }
  }, []);

  useEffect(() => {
    return () => {
      // Stop firing new requests if the user navigates away mid-run, and abort
      // whatever's currently in flight rather than letting it run to completion
      // in the background — credits already reserved for those still aren't
      // refunded (see app/credits.py), but nothing new should start or save.
      bulkImageStopRef.current = true;
      // bulkImageInFlightRef is a plain mutable Map we own, not a DOM ref —
      // reading .current at cleanup time (not a stale snapshot from mount) is
      // exactly what's wanted here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      bulkImageInFlightRef.current.forEach((controller, sceneId) => {
        controller.abort();
        void cancelSceneImageGeneration(sceneId);
      });
      // Same idea for a "Download All" run in progress -- nothing here is
      // credit-charged the way image generation is, so there's no cancel
      // callback to fire, just the fetches to stop.
      downloadAbortRef.current?.abort();
    };
  }, [cancelSceneImageGeneration]);

  useEffect(() => {
    if (!bulkImageProgress?.pausingUntil) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bulkImageProgress?.pausingUntil]);

  const tryAcquireImageSlot = useCallback(() => {
    if (activeImageGenerationsRef.current >= MAX_CONCURRENT_IMAGE_GENERATIONS) return false;
    activeImageGenerationsRef.current += 1;
    return true;
  }, []);

  const releaseImageSlot = useCallback(() => {
    activeImageGenerationsRef.current = Math.max(0, activeImageGenerationsRef.current - 1);
  }, []);

  const handleImageConcurrencyLimitReached = useCallback(() => {
    setAlert({
      type: "warning",
      title: "Too many images generating",
      message: `You can only generate up to ${MAX_CONCURRENT_IMAGE_GENERATIONS} images at once — wait for one to finish before starting another.`,
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [projectRes, scenesRes, charactersRes] = await Promise.all([
          authFetch(`/projects/${projectId}`),
          authFetch(`/projects/scenes/?project_id=${projectId}`),
          authFetch(`/projects/${projectId}/characters`),
        ]);
        const [projectData, scenesData, charactersData] = await Promise.all([
          projectRes.json(),
          scenesRes.json(),
          charactersRes.json(),
        ]);
        if (cancelled) return;
        setProject(projectData);
        setScriptDraft(projectData.script ?? "");
        setScenes(scenesData);
        setProjectCharacters(charactersData);
      } catch (err) {
        if (!cancelled) {
          setAlert({ title: "Failed to load project", message: err instanceof Error ? err.message : "Something went wrong." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const wordCount = useMemo(() => countWords(scriptDraft), [scriptDraft]);
  const scriptWordsOverLimit = Math.max(0, wordCount - MAX_SCRIPT_WORDS);
  const baseAutomaticCost = Math.ceil(wordCount / WORDS_PER_CREDIT_AUTO_BASE) || 0;
  const isProSceneSplit = project?.llm_model_id === "pro";
  const automaticCost = isProSceneSplit ? baseAutomaticCost * AUTOMATIC_PRO_COST_MULTIPLIER : baseAutomaticCost;
  const estimatedAutomaticSeconds = Math.max(
    BASE_GENERATION_SECONDS_PER_1000_WORDS,
    Math.ceil(wordCount / 1000) * BASE_GENERATION_SECONDS_PER_1000_WORDS,
  ) * (isProSceneSplit ? 2 : 1);
  const estimatedAutomaticWait = estimatedAutomaticSeconds >= 60
    ? `${Math.floor(estimatedAutomaticSeconds / 60)} minute${Math.floor(estimatedAutomaticSeconds / 60) === 1 ? "" : "s"}${estimatedAutomaticSeconds % 60 ? ` ${estimatedAutomaticSeconds % 60} seconds` : ""}`
    : `${estimatedAutomaticSeconds} seconds`;
  const manualCost = Math.ceil(wordCount / WORDS_PER_CREDIT_MANUAL) || 0;
  const manualImageCost = Math.ceil(scenes.length / SCENES_PER_CREDIT_MANUAL) || 0;
  const hasStyleTemplate = !!project?.snapshot_styletemplate_name;
  const canGenerateAutomatic = wordCount > 0 && scriptWordsOverLimit === 0 && hasStyleTemplate && !generatingScenes;

  // Scenes "Generate All Images (Automatic)" will actually touch — already-
  // generated scenes are skipped, and so are scenes with no image prompt (that
  // request would just 400 server-side, not a real generation attempt).
  const pendingImageScenes = useMemo(
    () => scenes.filter((s) => !s.generated_image_url && (s.scene_image_prompt ?? "").trim()),
    [scenes]
  );
  const bulkImageCost = pendingImageScenes.length * imageCreditCost(project?.image_model_id);

  // Everything currently downloadable: generated scene images/animations plus
  // the video thumbnail if one exists. Voiceover is deliberately absent — see
  // lib/downloadProject.ts's module docstring for why. Recomputed whenever
  // scenes/project change so the button's file count and disabled state stay
  // accurate as generations complete.
  const downloadTasks = useMemo(
    () => (project ? buildDownloadTasks(project, scenes) : []),
    [project, scenes]
  );

  const handleScriptBlur = async () => {
    if (!project || scriptDraft === (project.script ?? "")) return;
    if (scriptWordsOverLimit > 0) {
      setAlert({
        type: "warning",
        title: "Shorten your script",
        message: `Your script is ${scriptWordsOverLimit.toLocaleString()} words over the 4,000-word limit. Reduce it before leaving this field.`,
      });
      return;
    }
    setSavingScript(true);
    try {
      const res = await authFetch(`/projects/update/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptDraft }),
      });
      const data: Project = await res.json();
      setProject(data);
    } catch (err) {
      setAlert({ title: "Failed to save script", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSavingScript(false);
    }
  };

  const startNameEditing = () => {
    if (!project) return;
    setNameDraft(project.name);
    setNameEditing(true);
  };

  const saveName = async () => {
    if (!project) return;
    const name = nameDraft.trim();
    if (!name || name === project.name) {
      setNameEditing(false);
      return;
    }
    setSavingName(true);
    try {
      await renameProject(project.id, name);
      setProject({ ...project, name });
      setNameEditing(false);
    } catch (err) {
      setAlert({ title: "Failed to rename project", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSavingName(false);
    }
  };

  const handleGenerateScenesAutomatic = async () => {
    if (!project || !requireAuth()) return;
    const liveBalance = await refreshBalance();
    if (liveBalance !== null && liveBalance < automaticCost) {
      setAlert({
        title: "Not enough credits",
        message: `Splitting this script into scenes costs ${automaticCost} credits, you have ${liveBalance}.`,
      });
      return;
    }

    setGeneratingScenes(true);
    // The backend reserves the cost before calling the LLM, so drop the balance now.
    reserveBalance(automaticCost);
    try {
      const res = await authFetch("/projects/scenes/generate_automatic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      const data: GenerateScenesResponse = await res.json();
      handleScenesGenerated(data);
      setBalance(data.credits_remaining);
    } catch (err) {
      setAlert({ title: "Failed to generate scenes", message: err instanceof Error ? err.message : "Something went wrong." });
      // Refunded, or rejected before anything was reserved — only the backend knows.
      void refreshBalance();
    } finally {
      setGeneratingScenes(false);
    }
  };

  const handleScenesGenerated = (data: GenerateScenesResponse) => {
    setScenes(data.scenes);
    setProject((prev) =>
      prev
        ? {
            ...prev,
            title_of_video: data.title_of_video,
            description_of_video: data.description_of_video,
            tags_of_video: data.tags_of_video,
            thumbnail_prompt: data.thumbnail_prompt,
            // Re-splitting discards the previous batch's thumbnail server-side too.
            thumbnail_image_url: data.thumbnail_image_url,
          }
        : prev
    );
  };

  const handleOpenManualScenes = async () => {
    if (!project || !requireAuth()) return;
    const liveBalance = await refreshBalance();
    if (liveBalance !== null && liveBalance < manualCost) {
      setAlert({
        title: "Not enough credits",
        message: `Splitting this script into scenes (manual) costs ${manualCost} credits, you have ${liveBalance}.`,
      });
      return;
    }

    setChargingManualScenes(true);
    // Charged the instant this button is clicked, before the popup even shows
    // the copy-paste prompt — see generate_scenes_manual_charge's docstring for
    // why this can't wait until the user pastes a result back.
    reserveBalance(manualCost);
    try {
      const res = await authFetch("/projects/scenes/generate_manual_charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      const data: GenerateScenesManualChargeResponse = await res.json();
      setBalance(data.credits_remaining);
      setManualScenesPopupOpen(true);
    } catch (err) {
      setAlert({
        title: "Failed to charge for manual scene generation",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
      void refreshBalance();
    } finally {
      setChargingManualScenes(false);
    }
  };

  const handleOpenManualImages = async () => {
    if (!project || !requireAuth()) return;
    const liveBalance = await refreshBalance();
    if (liveBalance !== null && liveBalance < manualImageCost) {
      setAlert({
        title: "Not enough credits",
        message: `Manual image generation costs ${manualImageCost} credits for ${scenes.length} scenes, you have ${liveBalance}.`,
      });
      return;
    }

    setChargingManualImages(true);
    // The backend reserves the cost before this popup opens — there's no
    // provider call to await, so the balance drop and the popup open together.
    reserveBalance(manualImageCost);
    try {
      const res = await authFetch("/projects/image/generate_manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      const data: GenerateImagesManualResponse = await res.json();
      setBalance(data.credits_remaining);
      setManualImagesPopupOpen(true);
    } catch (err) {
      setAlert({
        title: "Failed to charge for manual image generation",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
      void refreshBalance();
    } finally {
      setChargingManualImages(false);
    }
  };

  type SceneImageResult = { status: "success" } | { status: "failed"; message: string } | { status: "aborted" };

  const generateOneSceneImage = async (scene: Scene, signal: AbortSignal): Promise<SceneImageResult> => {
    if (!project) return { status: "failed", message: "Project not loaded." };
    // Mirror the backend reserving the cost up front — same as SceneCard's own
    // individual Generate button.
    reserveBalance(imageCreditCost(project.image_model_id));
    try {
      const res = await authFetch("/projects/image/generate_and_save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: scene.id }),
        signal,
      });
      const data = await res.json();
      setScenes((prev) => prev.map((s) => (s.id === data.scene.id ? data.scene : s)));
      setBalance(data.credits_remaining);
      return { status: "success" };
    } catch (err) {
      // Could be a refunded failure or a rejection before anything was
      // reserved — only the backend knows which.
      void refreshBalance();
      if (signal.aborted) return { status: "aborted" };
      return { status: "failed", message: err instanceof Error ? err.message : "Failed to generate image." };
    }
  };

  // Poll-based interruptible wait for the between-chunk cooldowns — a plain
  // sleep(breakMs) would leave Stop unresponsive for up to a full 60s if
  // clicked mid-break.
  const interruptibleSleep = async (ms: number) => {
    const stepMs = 250;
    let waited = 0;
    while (waited < ms && !bulkImageStopRef.current) {
      const step = Math.min(stepMs, ms - waited);
      await sleep(step);
      waited += step;
    }
  };

  const handleStopBulkImages = () => {
    bulkImageStopRef.current = true;
    setBulkImageProgress((prev) => (prev ? { ...prev, stopping: true } : prev));
    // Abort exactly what's running right now — the whole point of Stop is that
    // scenes still mid-generation get cut off (and stay charged, since the
    // backend already reserved their credits) rather than finishing in the
    // background. Mirrors SceneCard's own per-scene Cancel button.
    bulkImageInFlightRef.current.forEach((controller, sceneId) => {
      controller.abort();
      void cancelSceneImageGeneration(sceneId);
    });
  };

  const handleGenerateAllImagesAutomatic = async () => {
    if (!project || !requireAuth() || bulkImageProgress) return;
    const targets = pendingImageScenes;
    if (targets.length === 0) return;

    const liveBalance = await refreshBalance();
    if (liveBalance !== null && liveBalance < bulkImageCost) {
      setAlert({
        title: "Not enough credits",
        message: `Generating all ${targets.length} remaining scene images costs ${bulkImageCost} credits, you have ${liveBalance}.`,
      });
      return;
    }

    // Headline progress is against the whole project (e.g. 25/120), not just
    // what this run will attempt — scenes already generated before this run
    // started count toward the numerator from the first render.
    const totalScenes = scenes.length;
    const startAlready = scenes.filter((s) => !!s.generated_image_url).length;
    const batchCount = Math.ceil(targets.length / BULK_IMAGE_BATCH_SIZE);

    bulkImageStopRef.current = false;
    let consecutiveFailures = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    const errors: { sceneNumber: number; message: string }[] = [];

    setBulkImageProgress({
      totalScenes,
      startAlready,
      targetCount: targets.length,
      completed: 0,
      failed: 0,
      cancelled: 0,
      batchIndex: 1,
      batchCount,
      batchSize: Math.min(BULK_IMAGE_BATCH_SIZE, targets.length),
      pausingUntil: null,
      stopping: false,
    });

    for (let i = 0; i < targets.length && !bulkImageStopRef.current; i += BULK_IMAGE_BATCH_SIZE) {
      const chunk = targets.slice(i, i + BULK_IMAGE_BATCH_SIZE);
      const batchIndex = Math.floor(i / BULK_IMAGE_BATCH_SIZE) + 1;

      setBulkImageProgress((prev) =>
        prev ? { ...prev, batchIndex, batchSize: chunk.length, pausingUntil: null } : prev
      );

      // Each member of the chunk waits for its own slot rather than assuming
      // all 5 are free — a SceneCard's own Generate button can be holding one
      // or more of them at the same time.
      const results = await Promise.all(
        chunk.map(async (scene) => {
          while (!tryAcquireImageSlot()) {
            if (bulkImageStopRef.current) return null;
            await sleep(300);
          }
          if (bulkImageStopRef.current) {
            releaseImageSlot();
            return null;
          }
          const controller = new AbortController();
          bulkImageInFlightRef.current.set(scene.id, controller);
          try {
            return await generateOneSceneImage(scene, controller.signal);
          } finally {
            bulkImageInFlightRef.current.delete(scene.id);
            releaseImageSlot();
          }
        })
      );

      results.forEach((result, idx) => {
        if (result === null) return; // never started — stop was requested while queued
        if (result.status === "success") {
          completed += 1;
          consecutiveFailures = 0;
        } else if (result.status === "aborted") {
          cancelled += 1;
        } else {
          failed += 1;
          consecutiveFailures += 1;
          errors.push({ sceneNumber: chunk[idx].scene_number, message: result.message });
        }
      });

      setBulkImageProgress((prev) =>
        prev ? { ...prev, completed, failed, cancelled, pausingUntil: null, stopping: bulkImageStopRef.current } : prev
      );

      // 5 failures in a row is a strong signal something is systemically wrong
      // (bad API key, exhausted quota, policy block) rather than one-off image
      // failures — stop spending credits on a run that's unlikely to recover.
      if (consecutiveFailures >= BULK_IMAGE_MAX_CONSECUTIVE_FAILURES) {
        bulkImageStopRef.current = true;
        break;
      }

      const isLastChunk = i + BULK_IMAGE_BATCH_SIZE >= targets.length;
      if (!isLastChunk && !bulkImageStopRef.current) {
        const doneSoFar = completed + failed;
        const breakMs =
          doneSoFar > 0 && doneSoFar % BULK_IMAGE_MEGA_BREAK_EVERY === 0
            ? BULK_IMAGE_MEGA_BREAK_MS
            : BULK_IMAGE_BATCH_BREAK_MS;
        setBulkImageProgress((prev) => (prev ? { ...prev, pausingUntil: Date.now() + breakMs } : prev));
        await interruptibleSleep(breakMs);
      }
    }

    setBulkImageProgress(null);

    const summaryParts: string[] = [];
    if (completed > 0) summaryParts.push(`${completed} generated`);
    if (cancelled > 0) summaryParts.push(`${cancelled} cancelled (already charged since generation had started)`);
    if (failed > 0) summaryParts.push(`${failed} failed`);

    if (cancelled > 0 || failed > 0) {
      setAlert({
        type: cancelled > 0 && failed === 0 ? "info" : "warning",
        title: cancelled > 0
          ? "Generation stopped"
          : consecutiveFailures >= BULK_IMAGE_MAX_CONSECUTIVE_FAILURES
          ? `Stopped after ${BULK_IMAGE_MAX_CONSECUTIVE_FAILURES} images failed in a row`
          : "Some images failed to generate",
        message: [summaryParts.join(", "), errors.length > 0 ? errors.map((e) => `Scene ${e.sceneNumber}: ${e.message}`).join("\n") : null]
          .filter(Boolean)
          .join("\n\n"),
      });
    } else if (completed > 0) {
      setAlert({
        type: "success",
        title: "All images generated",
        message: `Generated ${completed} image${completed !== 1 ? "s" : ""} successfully.`,
      });
    }
  };

  const handleStopDownload = () => {
    downloadAbortRef.current?.abort();
    setDownloadProgress((prev) => (prev ? { ...prev, stopping: true } : prev));
  };

  const handleDownloadAll = async () => {
    if (!project || downloadProgress || downloadTasks.length === 0) return;

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setDownloadProgress({ total: downloadTasks.length, completed: 0, failed: 0, currentFiles: [], stopping: false });

    try {
      const result = await runProjectDownload(downloadTasks, project.name, setDownloadProgress, controller.signal);

      if (result === null) {
        // User closed the OS folder picker without choosing anything -- not
        // an error, nothing happened, no alert needed.
        return;
      }

      const summaryParts: string[] = [];
      if (result.succeeded > 0) summaryParts.push(`${result.succeeded} file${result.succeeded !== 1 ? "s" : ""} saved`);
      if (result.cancelled > 0) summaryParts.push(`${result.cancelled} cancelled`);
      if (result.failed.length > 0) summaryParts.push(`${result.failed.length} failed`);
      const destinationLabel =
        result.destination === "directory" ? `into "${result.destinationName}"` : `as ${result.destinationName}`;

      setAlert({
        type: result.failed.length > 0 ? "warning" : result.cancelled > 0 ? "info" : "success",
        title:
          result.failed.length > 0
            ? "Download finished with some failures"
            : result.cancelled > 0
            ? "Download stopped"
            : "Download complete",
        message: [
          `${summaryParts.join(", ")} ${destinationLabel}.`,
          result.failed.length > 0 ? result.failed.map((f) => `${f.filename}: ${f.message}`).join("\n") : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    } catch (err) {
      setAlert({ title: "Download failed", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  if (loading) {
    // Scene count varies per project, so a pixel-exact skeleton isn't
    // possible the way it is for the fixed-shape card grids elsewhere — but
    // the header/script/menu/action-row section above the scene list is the
    // same fixed height on every project, and reserving that (plus a couple
    // scene-card-shaped placeholders as a "more is coming" signal) still cuts
    // out most of the jump a bare centered spinner leaves behind.
    return (
      <div className="flex flex-col gap-6 pb-16 animate-pulse" aria-hidden="true">
        <div className="h-8 w-64 max-w-full rounded bg-slate-100 dark:bg-slate-700/40" />

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-h-[320px] rounded-2xl bg-slate-100 dark:bg-slate-700/40" />
          <div className="lg:w-64 flex-shrink-0 flex flex-col gap-2.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[52px] rounded-xl bg-slate-100 dark:bg-slate-700/40" />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="h-11 w-56 rounded-xl bg-slate-100 dark:bg-slate-700/40" />
          <div className="h-11 w-56 rounded-xl bg-slate-100 dark:bg-slate-700/40" />
        </div>

        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-200 dark:border-border overflow-hidden"
          >
            <div className="h-11 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60" />
            <div className="p-4 h-64 bg-slate-100 dark:bg-slate-700/40" />
          </div>
        ))}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Project not found</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-16 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-brand-200/60 bg-gradient-to-r from-white to-brand-50 p-6 dark:border-white/10 dark:from-surface dark:to-slate-900">
        <p className="eyebrow w-full">Production workspace</p>
        {nameEditing ? (
          <>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setNameEditing(false);
              }}
              onBlur={saveName}
              disabled={savingName}
              aria-label="Project name"
              className="text-2xl md:text-3xl font-bold tracking-tight min-w-0 max-w-full text-slate-900 dark:text-white bg-transparent border-b-2 border-brand-400 focus:outline-none"
            />
            {savingName && <Loader2 className="w-4 h-4 animate-spin text-brand-500" />}
          </>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight break-words min-w-0 text-slate-900 dark:text-white">{project.name}</h1>
            <button
              onClick={startNameEditing}
              aria-label="Rename project"
              className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Script + menus */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between">
            <label htmlFor="project-script" className="text-sm font-medium text-slate-700 dark:text-slate-300">Your script</label>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {savingScript ? "Saving…" : `${wordCount} words`}
            </span>
          </div>
          <p id="script-save-help" className="text-xs leading-5 text-slate-500 dark:text-slate-400">Changes save when you leave this field. Refine your script before generating scenes (4,000 words maximum).</p>
          {scriptWordsOverLimit > 0 && (
            <p role="alert" aria-live="polite" className="text-xs font-medium leading-5 text-red-600 dark:text-red-400">
              Please reduce your script by {scriptWordsOverLimit.toLocaleString()} words. Scripts are limited to 4,000 words.
            </p>
          )}
          <textarea
            id="project-script"
            aria-describedby="script-save-help"
            value={scriptDraft}
            onChange={(e) => setScriptDraft(e.target.value)}
            onBlur={handleScriptBlur}
            placeholder="Paste your script here…"
            rows={16}
            className="w-full flex-1 min-h-[320px] px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 transition-all resize-none leading-relaxed"
          />
        </div>

        <div className="lg:w-64 flex-shrink-0 flex flex-col gap-2.5">
          <button
            onClick={() => requireAuth() && setCharactersPopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface hover:border-brand-300 dark:hover:border-brand-500/50 transition-all cursor-pointer text-left"
          >
            <Users className="w-4.5 h-4.5 text-brand-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200">Characters</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{projectCharacters.length}</span>
          </button>

          <button
            onClick={() => requireAuth() && setStyleTemplatePopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface hover:border-brand-300 dark:hover:border-brand-500/50 transition-all cursor-pointer text-left"
          >
            <Palette className="w-4.5 h-4.5 text-brand-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200 truncate">
              {project.snapshot_styletemplate_name ?? "Style Template"}
            </span>
          </button>

          <button
            onClick={() => requireAuth() && setVoiceoverPopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface hover:border-brand-300 dark:hover:border-brand-500/50 transition-all cursor-pointer text-left"
          >
            <Mic className="w-4.5 h-4.5 text-emerald-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200">Voiceover settings</span>
          </button>

          <button
            onClick={() => requireAuth() && setAdvancedSettingsPopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface hover:border-brand-300 dark:hover:border-brand-500/50 transition-all cursor-pointer text-left"
          >
            <Settings className="w-4.5 h-4.5 text-slate-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200">Advanced Settings</span>
          </button>
        </div>
      </div>

      {!hasStyleTemplate && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Import a style template before generating scenes.</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleGenerateScenesAutomatic}
          disabled={!canGenerateAutomatic}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-action-foreground bg-action hover:bg-action-hover rounded-xl shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generatingScenes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generatingScenes ? "Generating Scenes…" : "Generate Scenes (Automatic)"}
          {wordCount > 0 && (
            <span className="flex items-center gap-1 pl-2 ml-1 border-l border-white/30 text-white/90">
              <CreditCoinIcon className="w-3.5 h-3.5" />
              {automaticCost}
            </span>
          )}
        </button>

        {generatingScenes && (
          <p role="status" className="basis-full text-xs text-brand-700 dark:text-brand-300">
            Generating scenes with {isProSceneSplit ? "Pro" : "Base"} model. This script usually takes about {estimatedAutomaticWait}; please wait.
          </p>
        )}

        <button
          onClick={handleOpenManualScenes}
          disabled={!canGenerateAutomatic || chargingManualScenes}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {chargingManualScenes ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
          Generate Scenes (Manual)
          {wordCount > 0 && (
            <span className="flex items-center gap-1 pl-2 ml-1 border-l border-emerald-200 dark:border-emerald-500/30">
              <CreditCoinIcon className="w-3.5 h-3.5" />
              {manualCost}
            </span>
          )}
        </button>

        <button
          disabled
          title="Coming soon"
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/60 rounded-xl cursor-not-allowed"
        >
          <Clock className="w-4 h-4" />
          Generate Voiceover
        </button>

     
      </div>

      {project.title_of_video && (
        <VideoMetaDataCard
          project={project}
          onThumbnailGenerated={(url) => setProject((prev) => (prev ? { ...prev, thumbnail_image_url: url } : prev))}
          onMetadataSaved={(updated) => setProject(updated)}
        />
      )}

      {scenes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerateAllImagesAutomatic}
            disabled={!!bulkImageProgress || pendingImageScenes.length === 0}
            title={pendingImageScenes.length === 0 ? "All scene images are already generated" : undefined}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-action-foreground bg-action hover:bg-action-hover rounded-xl shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkImageProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate All Images (Automatic)
            {pendingImageScenes.length > 0 && (
              <span className="flex items-center gap-1 pl-2 ml-1 border-l border-white/30 text-white/90">
                <CreditCoinIcon className="w-3.5 h-3.5" />
                {bulkImageCost}
              </span>
            )}
          </button>

          <button
            onClick={handleOpenManualImages}
            disabled={chargingManualImages}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {chargingManualImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            Generate All Images (Manual)
            <span className="flex items-center gap-1 pl-2 ml-1 border-l border-emerald-200 dark:border-emerald-500/30">
              <CreditCoinIcon className="w-3.5 h-3.5" />
              {manualImageCost}
            </span>
          </button>

          <button
            onClick={handleDownloadAll}
            disabled={!!downloadProgress || downloadTasks.length === 0}
            title={
              downloadTasks.length === 0
                ? "Nothing generated yet — there are no images, animations, or a thumbnail to download."
                : supportsDirectoryPicker()
                ? "Choose a folder — images go in images/, animations in animation/, and the thumbnail in the folder itself."
                : "Your browser can't choose a folder directly, so this downloads everything as one .zip instead. Use Chrome or Edge to save straight to a folder."
            }
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download All
            {downloadTasks.length > 0 && (
              <span className="pl-2 ml-1 border-l border-emerald-200 dark:border-emerald-500/30 text-emerald-600/80 dark:text-emerald-400/80 font-normal">
                {downloadTasks.length} file{downloadTasks.length !== 1 ? "s" : ""}
              </span>
            )}
          </button>
        </div>
      )}

      {downloadProgress && (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                {downloadProgress.completed}/{downloadProgress.total} files saved
                {downloadProgress.failed > 0 && (
                  <span className="text-red-600 dark:text-red-400">· {downloadProgress.failed} failed</span>
                )}
              </span>
              <span className="text-[12px] text-emerald-600/80 dark:text-emerald-400/80 pl-6">
                {downloadProgress.stopping
                  ? "Stopping — finishing what's already in flight…"
                  : downloadProgress.currentFiles.length > 0
                  ? `Downloading ${downloadProgress.currentFiles.slice(0, 2).join(", ")}${
                      downloadProgress.currentFiles.length > 2
                        ? ` +${downloadProgress.currentFiles.length - 2} more`
                        : ""
                    }…`
                  : "Starting…"}
              </span>
            </div>
            <button
              onClick={handleStopDownload}
              disabled={downloadProgress.stopping}
              className="text-[12px] font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
            >
              {downloadProgress.stopping ? "Stopping…" : "Stop"}
            </button>
          </div>
          <div className="h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{
                width: `${Math.min(100, (downloadProgress.completed / Math.max(1, downloadProgress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {bulkImageProgress && (
        <div className="rounded-xl border border-brand-100 dark:border-brand-500/30 bg-brand-50/70 dark:bg-brand-500/10 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[13px] font-medium text-brand-700 dark:text-brand-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                {bulkImageProgress.startAlready + bulkImageProgress.completed}/{bulkImageProgress.totalScenes} images
                generated
                {bulkImageProgress.failed > 0 && (
                  <span className="text-red-600 dark:text-red-400">· {bulkImageProgress.failed} failed</span>
                )}
                {bulkImageProgress.cancelled > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">· {bulkImageProgress.cancelled} cancelled</span>
                )}
              </span>
              <span className="text-[12px] text-brand-600/80 dark:text-brand-400/80 pl-6">
                {bulkImageProgress.stopping
                  ? "Stopping — cancelling images in progress…"
                  : bulkImageProgress.pausingUntil
                  ? `Pausing ${Math.max(0, Math.ceil((bulkImageProgress.pausingUntil - nowTick) / 1000))}s to avoid rate limits…`
                  : `Generating batch ${bulkImageProgress.batchIndex}/${bulkImageProgress.batchCount} (${bulkImageProgress.batchSize} image${bulkImageProgress.batchSize !== 1 ? "s" : ""})…`}
              </span>
            </div>
            <button
              onClick={handleStopBulkImages}
              disabled={bulkImageProgress.stopping}
              className="text-[12px] font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
            >
              {bulkImageProgress.stopping ? "Stopping…" : "Stop"}
            </button>
          </div>
          <div className="h-1.5 rounded-full bg-brand-100 dark:bg-brand-950/50 overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  ((bulkImageProgress.startAlready + bulkImageProgress.completed) / bulkImageProgress.totalScenes) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {scenes.length > 0 && (
        <div className="flex flex-col gap-5">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              projectCharacters={projectCharacters}
              videoAspectRatio={project.snapshot_styletemplate_video_aspect_ratio}
              imageModelId={project.image_model_id}
              animationModelId={project.animation_model_id}
              onUpdated={(updated) => setScenes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
              onDeleted={(id) => setScenes((prev) => prev.filter((s) => s.id !== id))}
              onInserted={(updatedScenes) => setScenes(updatedScenes)}
              onAcquireImageSlot={tryAcquireImageSlot}
              onReleaseImageSlot={releaseImageSlot}
              onImageConcurrencyLimitReached={handleImageConcurrencyLimitReached}
            />
          ))}
        </div>
      )}

      <ChooseCharacterPopUp
        isOpen={charactersPopupOpen}
        onClose={() => setCharactersPopupOpen(false)}
        projectId={project.id}
        importedCharacters={projectCharacters}
        onImported={(chars) => setProjectCharacters(chars)}
        onRemoved={(id) => setProjectCharacters((prev) => prev.filter((c) => c.id !== id))}
        onCharacterUpdated={(updated) =>
          setProjectCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
        }
      />

      <ChooseStyleTemplatePopUp
        isOpen={styleTemplatePopupOpen}
        onClose={() => setStyleTemplatePopupOpen(false)}
        projectId={project.id}
        project={project}
        onImported={(updated) => setProject(updated)}
      />

      <VoiceOverControllerPopUp
        isOpen={voiceoverPopupOpen}
        onClose={() => setVoiceoverPopupOpen(false)}
        projectId={project.id}
        initialSettings={{
          vo_voice_id: project.vo_voice_id ?? "95etAma035P6Ys5iv7Oo",
          vo_model_id: project.vo_model_id ?? "eleven_multilingual_v2",
          vo_stability: project.vo_stability ?? 40,
          vo_similarity: project.vo_similarity ?? 70,
          vo_style: project.vo_style ?? 30,
          vo_speaker_boost: project.vo_speaker_boost ?? true,
          vo_speed: project.vo_speed ?? 0.88,
        }}
        onSaved={(updated) => setProject(updated)}
      />

      <AdvancedSettingsPopUp
        isOpen={advancedSettingsPopupOpen}
        onClose={() => setAdvancedSettingsPopupOpen(false)}
        projectId={project.id}
        currentLlmModelId={project.llm_model_id}
        currentImageModelId={project.image_model_id}
        currentAnimationModelId={project.animation_model_id}
        onSaved={(updated) => setProject(updated)}
      />

      <GenerateScenesManualPopUp
        isOpen={manualScenesPopupOpen}
        onClose={() => setManualScenesPopupOpen(false)}
        project={project}
        projectCharacters={projectCharacters}
        onGenerated={handleScenesGenerated}
      />

      <ManualImageGenerationPromptCopyPopUp
        isOpen={manualImagesPopupOpen}
        onClose={() => setManualImagesPopupOpen(false)}
        scenes={scenes}
        projectCharacters={projectCharacters}
      />

      <AlertMessagePopUp
        isOpen={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? ""}
        message={alert?.message ?? ""}
        type={alert?.type ?? "error"}
      />
    </div>
  );
}
