"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Clock,
  ClipboardList,
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
import CreditCoinIcon from "@/components/CreditCoinIcon";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ChooseCharacterPopUp from "@/components/projectfolder/ChooseCharacterPopUp";
import ChooseStyleTemplatePopUp from "@/components/projectfolder/ChooseStyleTemplatePopUp";
import VoiceOverControllerPopUp from "@/components/projectfolder/VoiceOverControllerPopUp";
import AdvancedSettingsPopUp from "@/components/projectfolder/AdvancedSettingsPopUp";
import GenerateScenesManualPopUp from "@/components/projectfolder/GenerateScenesManualPopUp";
import SceneCard from "@/components/projectfolder/SceneCard";
import VideoMetaDataCard from "@/components/projectfolder/VideoMetaDataCard";
import type { Project, ProjectCharacter } from "@/types/project";
import type { Scene, GenerateScenesResponse } from "@/types/scene";

const WORDS_PER_CREDIT_AUTO = 10;
// Mirrors app/routes/project/scenesplitcommon.py's WORDS_PER_CREDIT_MANUAL —
// 10x cheaper per word than automatic since no provider is billed.
const WORDS_PER_CREDIT_MANUAL = 100;

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

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

  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

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
  const automaticCost = Math.ceil(wordCount / WORDS_PER_CREDIT_AUTO) || 0;
  const manualCost = Math.ceil(wordCount / WORDS_PER_CREDIT_MANUAL) || 0;
  const hasStyleTemplate = !!project?.snapshot_styletemplate_name;
  const canGenerateAutomatic = wordCount > 0 && hasStyleTemplate && !generatingScenes;

  const handleScriptBlur = async () => {
    if (!project || scriptDraft === (project.script ?? "")) return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
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
      <div className="flex items-center gap-2">
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
              className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white bg-transparent border-b-2 border-indigo-400 focus:outline-none"
            />
            {savingName && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
          </>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{project.name}</h1>
            <button
              onClick={startNameEditing}
              aria-label="Rename project"
              className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
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
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Script</label>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {savingScript ? "Saving…" : `${wordCount} words`}
            </span>
          </div>
          <textarea
            value={scriptDraft}
            onChange={(e) => setScriptDraft(e.target.value)}
            onBlur={handleScriptBlur}
            placeholder="Paste your script here…"
            rows={16}
            className="w-full flex-1 min-h-[320px] px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all resize-none leading-relaxed"
          />
        </div>

        <div className="lg:w-64 flex-shrink-0 flex flex-col gap-2.5">
          <button
            onClick={() => requireAuth() && setCharactersPopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all cursor-pointer text-left"
          >
            <Users className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200">Characters</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{projectCharacters.length}</span>
          </button>

          <button
            onClick={() => requireAuth() && setStyleTemplatePopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all cursor-pointer text-left"
          >
            <Palette className="w-4.5 h-4.5 text-violet-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200 truncate">
              {project.snapshot_styletemplate_name ?? "Style Template"}
            </span>
          </button>

          <button
            onClick={() => requireAuth() && setVoiceoverPopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all cursor-pointer text-left"
          >
            <Mic className="w-4.5 h-4.5 text-emerald-500 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-medium text-slate-700 dark:text-slate-200">Voiceover</span>
          </button>

          <button
            onClick={() => requireAuth() && setAdvancedSettingsPopupOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all cursor-pointer text-left"
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
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generatingScenes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Scenes (Automatic)
          {wordCount > 0 && (
            <span className="flex items-center gap-1 pl-2 ml-1 border-l border-white/30 text-white/90">
              <CreditCoinIcon className="w-3.5 h-3.5" />
              {automaticCost}
            </span>
          )}
        </button>

        <button
          onClick={() => requireAuth() && setManualScenesPopupOpen(true)}
          disabled={!canGenerateAutomatic}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ClipboardList className="w-4 h-4" />
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

        {balance !== null && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <CreditCoinIcon className="w-3.5 h-3.5" />
            {balance} credits available
          </span>
        )}
      </div>

      {project.title_of_video && (
        <VideoMetaDataCard
          project={project}
          onThumbnailGenerated={(url) => setProject((prev) => (prev ? { ...prev, thumbnail_image_url: url } : prev))}
          onMetadataSaved={(updated) => setProject(updated)}
        />
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
      />

      <ChooseStyleTemplatePopUp
        isOpen={styleTemplatePopupOpen}
        onClose={() => setStyleTemplatePopupOpen(false)}
        projectId={project.id}
        currentSnapshotName={project.snapshot_styletemplate_name}
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

      <AlertMessagePopUp
        isOpen={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? ""}
        message={alert?.message ?? ""}
        type="error"
      />
    </div>
  );
}
