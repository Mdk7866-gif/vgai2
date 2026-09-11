"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Layers, Loader2, LogIn, Save, Sparkles, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCreditBalance } from "@/context/CreditBalanceContext";
import { useProjects } from "@/context/ProjectsContext";
import { authFetch } from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";
import {
  CATEGORY_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  SCRIPT_DESCRIPTION_MAX_WORDS,
  TOPIC_RESEARCH_CREDIT_COST,
  WORD_LENGTH_OPTIONS,
  scriptCreditCost,
} from "@/lib/scriptGenerationOptions";
import type { ContentType, GeneratedScript, ScriptTemplate, ViralTopic } from "@/types/scripttemplate";
import CreditCoinIcon from "@/components/CreditCoinIcon";
import SuggestionTopicCard from "@/components/generatescript/SuggestionTopicCard";
import GeneratedScriptCard from "@/components/generatescript/GeneratedScriptCard";
import GeneratedScriptFeedbackPopUp from "@/components/generatescript/GeneratedScriptFeedbackPopUp";
import ShowScriptTemplatesCardPopUp from "@/components/generatescript/ShowScriptTemplatesCardPopUp";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";

const OTHER_CATEGORY = "Other";
const CATEGORY_SELECT_OPTIONS = [...CATEGORY_OPTIONS, OTHER_CATEGORY];
const GENERATED_SCRIPTS_PAGE_SIZE = 10;

// Remembers which script_template the user is currently working in, across
// page reloads, so their researched topics/form state don't just vanish.
const CURRENT_TEMPLATE_STORAGE_KEY = "vgai_current_script_template_id";

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 transition-all";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

export default function GenerateScriptPage() {
  const { user, requireAuth, loading: authLoading } = useAuth();
  const router = useRouter();
  const { createProject } = useProjects();

  const [category, setCategory] = useState(CATEGORY_SELECT_OPTIONS[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const countryBoxRef = useRef<HTMLDivElement>(null);
  const [contentType, setContentType] = useState<ContentType>("long_videos");
  const [scriptWordLength, setScriptWordLength] = useState(WORD_LENGTH_OPTIONS[0]);
  const [topicDescription, setTopicDescription] = useState("");
  const [scriptDescription, setScriptDescription] = useState("");

  // The script_templates row the current research/generate session is bound to.
  // Re-researching while this is set updates that same row + its 10 topics in
  // place rather than creating a new session.
  const [currentScriptTemplateId, setCurrentScriptTemplateId] = useState<string | null>(null);
  // The word-length band actually stored on that row as of the last successful
  // research call — used for cost display/checks on the topic cards so they
  // never drift from what the backend will actually charge, even if the user
  // nudges the Script Length dropdown afterward without re-researching.
  const [activeWordLength, setActiveWordLength] = useState<string | null>(null);

  const { balance, setBalance, refreshBalance } = useCreditBalance();

  const [researching, setResearching] = useState(false);
  const [topics, setTopics] = useState<ViralTopic[]>([]);
  const [generatingTopicTitle, setGeneratingTopicTitle] = useState<string | null>(null);
  const [generatedScripts, setGeneratedScripts] = useState<GeneratedScript[]>([]);

  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templatesPopupOpen, setTemplatesPopupOpen] = useState(false);

  const [feedbackTarget, setFeedbackTarget] = useState<GeneratedScript | null>(null);
  const [feedbackPopupOpen, setFeedbackPopupOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GeneratedScript | null>(null);
  const [deletingScript, setDeletingScript] = useState(false);

  const [alert, setAlert] = useState<{ title: string; message: string; type?: "error" | "info" } | null>(null);

  const scriptDescriptionWordCount = countWords(scriptDescription);
  const scriptDescriptionOverLimit = scriptDescriptionWordCount > SCRIPT_DESCRIPTION_MAX_WORDS;

  const effectiveCategory = category === OTHER_CATEGORY ? customCategory.trim() : category;

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [countryQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countryBoxRef.current && !countryBoxRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formValid =
    !!effectiveCategory &&
    !!targetCountry &&
    !!topicDescription.trim() &&
    !!scriptDescription.trim() &&
    !scriptDescriptionOverLimit;

  // Restore the user's generated-script history (always) and, if they had an
  // active research session going, its form state + topics (once).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch("/scripttemplates/generatedscripts");
        const data = (await res.json()) as GeneratedScript[];
        if (!cancelled) setGeneratedScripts(data);
      } catch {
        // History just won't be restored this load — non-fatal.
      }

      const storedId = localStorage.getItem(CURRENT_TEMPLATE_STORAGE_KEY);
      if (!storedId || cancelled) return;

      try {
        const [templateRes, topicsRes] = await Promise.all([
          authFetch(`/scripttemplates/${storedId}`),
          authFetch(`/scripttemplates/${storedId}/topics`),
        ]);
        const template = (await templateRes.json()) as ScriptTemplate;
        const restoredTopics = (await topicsRes.json()) as ViralTopic[];
        if (cancelled) return;

        const isKnownCategory = CATEGORY_OPTIONS.includes(template.category);
        setCategory(isKnownCategory ? template.category : OTHER_CATEGORY);
        setCustomCategory(isKnownCategory ? "" : template.category);
        setTargetCountry(template.target_country);
        setContentType(template.content_type);
        setScriptWordLength(template.script_word_length);
        setTopicDescription(template.topic_description);
        setScriptDescription(template.script_description);
        setCurrentScriptTemplateId(storedId);
        setActiveWordLength(template.script_word_length);
        setTopics(restoredTopics);
      } catch {
        localStorage.removeItem(CURRENT_TEMPLATE_STORAGE_KEY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const scriptCost = useMemo(() => scriptCreditCost(scriptWordLength), [scriptWordLength]);
  const activeGenerateCost = useMemo(
    () => scriptCreditCost(activeWordLength ?? scriptWordLength),
    [activeWordLength, scriptWordLength]
  );
  const insufficientForResearch = balance !== null && balance < TOPIC_RESEARCH_CREDIT_COST;

  // Cards are numbered "Script #N" counting up from the earliest generated
  // (README behavior), which requires each card's position in the *full*
  // array — pairing before paginating keeps that number stable across pages,
  // since a plain slice would otherwise lose the original index.
  const numberedScripts = useMemo(
    () => generatedScripts.map((script, i) => ({ script, number: generatedScripts.length - i })),
    [generatedScripts]
  );
  const {
    page: scriptsPage,
    setPage: setScriptsPage,
    pageCount: scriptsPageCount,
    pageItems: visibleScripts,
    totalItems: totalScripts,
  } = usePagination(numberedScripts, GENERATED_SCRIPTS_PAGE_SIZE);

  const handleResearch = async () => {
    if (!requireAuth()) return;
    if (!formValid) {
      setAlert({ title: "Missing info", message: "Please fill in category, target country, topic description, and script description first." });
      return;
    }

    const freshBalance = await refreshBalance();
    if (freshBalance !== null && freshBalance < TOPIC_RESEARCH_CREDIT_COST) {
      setAlert({
        title: "Not enough credits",
        message: `Researching viral topics costs ${TOPIC_RESEARCH_CREDIT_COST} credits, you have ${freshBalance}.`,
      });
      return;
    }

    setResearching(true);
    try {
      const res = await authFetch("/scripttemplates/generatetopics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_template_id: currentScriptTemplateId,
          category: effectiveCategory,
          topic_description: topicDescription.trim(),
          script_description: scriptDescription.trim(),
          content_type: contentType,
          target_country: targetCountry,
          script_word_length: scriptWordLength,
        }),
      });
      const data = await res.json();
      setCurrentScriptTemplateId(data.script_template_id);
      localStorage.setItem(CURRENT_TEMPLATE_STORAGE_KEY, data.script_template_id);
      setActiveWordLength(scriptWordLength);
      setTopics(data.topics);
      setBalance(data.credits_remaining);
    } catch (err) {
      setAlert({ title: "Research failed", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setResearching(false);
    }
  };

  const handleGenerateScript = async (topic: ViralTopic) => {
    if (!requireAuth()) return;
    if (!currentScriptTemplateId) return;

    const freshBalance = await refreshBalance();
    if (freshBalance !== null && freshBalance < activeGenerateCost) {
      setAlert({
        title: "Not enough credits",
        message: `Generating this script costs ${activeGenerateCost} credits, you have ${freshBalance}.`,
      });
      return;
    }

    setGeneratingTopicTitle(topic.title);
    try {
      const res = await authFetch("/scripttemplates/generatescript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_template_id: currentScriptTemplateId,
          topic: topic.title,
        }),
      });
      const data = await res.json();
      const newScript: GeneratedScript = {
        id: data.generated_script_id,
        script_template_id: data.script_template_id,
        topic: data.topic,
        script: data.script,
        word_count: data.word_count,
        characters: data.characters,
        script_word_length: activeWordLength ?? scriptWordLength,
      };
      setGeneratedScripts((prev) => [newScript, ...prev]);
      // A freshly generated script always lands at the front of the full list
      // (numbered highest, per the "counts up from earliest" scheme above), so
      // jump back to page 1 to actually show it rather than leaving the user on
      // whatever page they were paginated to.
      setScriptsPage(1);
      setBalance(data.credits_remaining);
    } catch (err) {
      setAlert({ title: "Script generation failed", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setGeneratingTopicTitle(null);
    }
  };

  const handleImport = async (generated: GeneratedScript) => {
    if (!requireAuth()) return;
    try {
      const created = await createProject(generated.topic, generated.script);
      router.push(`/project_folder/${created.id}`);
    } catch (err) {
      setAlert({
        title: "Failed to import script",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  const handleImprovise = (generated: GeneratedScript) => {
    if (!requireAuth()) return;
    setFeedbackTarget(generated);
    setFeedbackPopupOpen(true);
  };

  const handleImprovised = (updated: GeneratedScript) => {
    setGeneratedScripts((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setFeedbackPopupOpen(false);
    refreshBalance();
  };

  const handleUpdateGeneratedScript = async (
    generated: GeneratedScript,
    updates: { topic: string; script: string }
  ) => {
    try {
      const res = await authFetch(`/scripttemplates/generatedscripts/${generated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setGeneratedScripts((prev) =>
        prev.map((g) =>
          g.id === generated.id
            ? {
                id: data.id,
                script_template_id: data.script_template_id,
                topic: data.topic,
                script: data.script,
                word_count: data.word_count,
                characters: data.characters,
                script_word_length: data.script_word_length,
              }
            : g
        )
      );
    } catch (err) {
      setAlert({ title: "Failed to save changes", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  const handleDeleteGeneratedScript = (generated: GeneratedScript) => {
    if (!requireAuth()) return;
    setDeleteTarget(generated);
  };

  const confirmDeleteGeneratedScript = async () => {
    if (!deleteTarget) return;
    setDeletingScript(true);
    try {
      await authFetch(`/scripttemplates/generatedscripts/${deleteTarget.id}`, { method: "DELETE" });
      setGeneratedScripts((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setAlert({ title: "Failed to delete script", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setDeletingScript(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!requireAuth()) return;
    if (!formValid) {
      setAlert({ title: "Missing info", message: "Please fill in category, target country, topic description, and script description first." });
      return;
    }

    setSavingTemplate(true);
    try {
      const res = await authFetch("/scripttemplates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_template_id: currentScriptTemplateId,
          category: effectiveCategory,
          topic_description: topicDescription.trim(),
          script_description: scriptDescription.trim(),
          content_type: contentType,
          target_country: targetCountry,
          script_word_length: scriptWordLength,
        }),
      });
      const data = await res.json();
      setCurrentScriptTemplateId(data.id);
      localStorage.setItem(CURRENT_TEMPLATE_STORAGE_KEY, data.id);
      setAlert({ title: "Template saved", message: "You can re-import it anytime from \"My Templates\".", type: "info" });
    } catch (err) {
      setAlert({ title: "Failed to save template", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleImportTemplate = async (template: ScriptTemplate) => {
    const isKnownCategory = CATEGORY_OPTIONS.includes(template.category);
    setCategory(isKnownCategory ? template.category : OTHER_CATEGORY);
    setCustomCategory(isKnownCategory ? "" : template.category);
    setTargetCountry(template.target_country);
    setContentType(template.content_type);
    setScriptWordLength(template.script_word_length);
    setTopicDescription(template.topic_description);
    setScriptDescription(template.script_description);
    setTemplatesPopupOpen(false);

    setCurrentScriptTemplateId(template.id);
    localStorage.setItem(CURRENT_TEMPLATE_STORAGE_KEY, template.id);
    setActiveWordLength(template.script_word_length);

    try {
      const res = await authFetch(`/scripttemplates/${template.id}/topics`);
      setTopics((await res.json()) as ViralTopic[]);
    } catch {
      setTopics([]);
    }
  };

  const handleTemplateDeleted = (deletedId: string) => {
    if (deletedId !== currentScriptTemplateId) return;
    localStorage.removeItem(CURRENT_TEMPLATE_STORAGE_KEY);
    setCurrentScriptTemplateId(null);
    setActiveWordLength(null);
    setTopics([]);
  };

  return (
    <div className="flex flex-col gap-8 pb-16 animate-in fade-in duration-500">
      <div className="relative flex flex-col items-start justify-between gap-6 rounded-3xl border border-brand-200/60 bg-gradient-to-br from-white via-brand-50/70 to-cyan-50/60 p-6 shadow-sm dark:border-white/10 dark:from-surface dark:via-surface dark:to-slate-900 lg:p-8">
        <div>
          <p className="eyebrow mb-3">The script studio</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Generate Script
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
            Research trending topics and let AI write a full video script, ready to import into a project.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              if (!requireAuth()) return;
              setTemplatesPopupOpen(true);
            }}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-brand-600 dark:text-brand-400 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95 cursor-pointer ring-1 ring-brand-200 dark:ring-brand-500/40"
          >
            <Layers className="w-5 h-5" />
            <span>My Templates</span>
          </button>
        </div>
      </div>

      <ol aria-label="Script creation workflow" className="grid gap-3 sm:grid-cols-3">
        {[
          ["01", "Define your brief", "Choose an audience, format, and creative direction."],
          ["02", "Explore the topics", "Research ideas, then choose a topic to develop."],
          ["03", "Make it your own", "Edit your script and import it into a project."],
        ].map(([number, title, copy]) => (
          <li key={number} className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[.03]">
            <span className="text-sm font-semibold text-brand-500">{number}</span>
            <div><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy}</p></div>
          </li>
        ))}
      </ol>

      {!authLoading && !user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-2xl">
          <div className="w-12 h-12 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/30 text-brand-600 dark:text-brand-400 rounded-xl flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to generate scripts</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Script generation and your saved templates are tied to your account.
          </p>
          <button
            onClick={() => requireAuth()}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-3xl p-5 sm:p-8 flex flex-col gap-5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="gs-category" className={labelClass}>
                  Category
                </label>
                <select
                  id="gs-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                >
                  {CATEGORY_SELECT_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {category === OTHER_CATEGORY && (
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Type your category"
                    className={`${inputClass} mt-2`}
                  />
                )}
              </div>

              <div ref={countryBoxRef} className="relative">
                <label htmlFor="gs-country" className={labelClass}>
                  Target Country
                </label>
                <div className="relative">
                  <input
                    id="gs-country"
                    type="text"
                    autoComplete="off"
                    value={countryOpen ? countryQuery : targetCountry}
                    onFocus={() => {
                      setCountryQuery(targetCountry);
                      setCountryOpen(true);
                    }}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (filteredCountries.length > 0) {
                          setTargetCountry(filteredCountries[0]);
                          setCountryQuery(filteredCountries[0]);
                          setCountryOpen(false);
                        }
                      } else if (e.key === "Escape") {
                        setCountryQuery(targetCountry);
                        setCountryOpen(false);
                      }
                    }}
                    placeholder="Select a country"
                    className={`${inputClass} pr-9`}
                  />
                  {targetCountry && !countryOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetCountry("");
                        setCountryQuery("");
                      }}
                      aria-label="Clear country"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {countryOpen && (
                  <div className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg dark:shadow-slate-950/60">
                    {filteredCountries.length === 0 ? (
                      <p className="px-3.5 py-2.5 text-sm text-slate-400 dark:text-slate-500">No matching country</p>
                    ) : (
                      filteredCountries.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setTargetCountry(c);
                            setCountryQuery(c);
                            setCountryOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-sm cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-500/10 ${
                            c === targetCountry
                              ? "text-brand-600 dark:text-brand-400 font-medium"
                              : "text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {c}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Video Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {CONTENT_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setContentType(opt.value)}
                      aria-pressed={contentType === opt.value}
                      className={`px-4 py-2.5 rounded-xl border text-sm font-semibold text-center transition-all cursor-pointer ${
                        contentType === opt.value
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/30"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      {opt.label}
                      <span className="block text-xs font-normal opacity-75">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="gs-word-length" className={labelClass}>
                  Script Length
                </label>
                <select
                  id="gs-word-length"
                  value={scriptWordLength}
                  onChange={(e) => setScriptWordLength(e.target.value)}
                  className={inputClass}
                >
                  {WORD_LENGTH_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w} words
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <CreditCoinIcon className="w-3 h-3" />
                  {scriptCost} credits to generate a script in this range
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="gs-topic-description" className={labelClass}>
                Topic Description
              </label>
              <textarea
                id="gs-topic-description"
                value={topicDescription}
                onChange={(e) => setTopicDescription(e.target.value)}
                placeholder="What's your channel/video generally about? This grounds the topic research."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="gs-script-description" className={labelClass}>
                  Script Description
                </label>
                <span
                  className={`text-xs font-medium tabular-nums ${
                    scriptDescriptionOverLimit ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {scriptDescriptionWordCount}/{SCRIPT_DESCRIPTION_MAX_WORDS} words
                </span>
              </div>
              <textarea
                id="gs-script-description"
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                placeholder="Tell the AI exactly how you want the script written — tone, structure, must-hit points, anything important."
                rows={5}
                className={`${inputClass} resize-none ${
                  scriptDescriptionOverLimit
                    ? "border-red-300 dark:border-red-500/60 focus:ring-red-500/50 focus:border-red-400"
                    : ""
                }`}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleResearch}
                disabled={researching || !formValid || insufficientForResearch}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-action-foreground bg-action hover:bg-action-hover rounded-lg shadow-md shadow-brand-200 dark:shadow-brand-900/40 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {researching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {researching ? "Researching…" : "Get Top 10 Viral Topics"}
                <span className="flex items-center gap-1 pl-2 ml-0.5 border-l border-white/30 text-brand-100 dark:border-current/20 dark:text-action-foreground">
                  <CreditCoinIcon className="w-3.5 h-3.5" />
                  {TOPIC_RESEARCH_CREDIT_COST}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate || !formValid}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save as Template
              </button>
            </div>
          </div>

          {researching ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Researching the web for trending topics — this can take up to 20 seconds.
              </p>
            </div>
          ) : topics.length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top 10 Viral Topics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {topics.map((topic) => (
                  <SuggestionTopicCard
                    key={topic.title}
                    topic={topic}
                    creditCost={activeGenerateCost}
                    onGenerate={handleGenerateScript}
                    generating={generatingTopicTitle === topic.title}
                    disabled={generatingTopicTitle !== null && generatingTopicTitle !== topic.title}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {generatedScripts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Generated Scripts</h2>
              <div className="flex flex-col gap-5">
                {visibleScripts.map(({ script, number }) => (
                  <GeneratedScriptCard
                    key={script.id}
                    generated={script}
                    index={number}
                    onImport={handleImport}
                    onImprovise={handleImprovise}
                    onDelete={handleDeleteGeneratedScript}
                    onUpdate={handleUpdateGeneratedScript}
                  />
                ))}
              </div>
              <Pagination
                page={scriptsPage}
                pageCount={scriptsPageCount}
                totalItems={totalScripts}
                pageSize={GENERATED_SCRIPTS_PAGE_SIZE}
                itemLabel="generated scripts"
                onChange={setScriptsPage}
              />
            </div>
          )}
        </>
      )}

      <ShowScriptTemplatesCardPopUp
        isOpen={templatesPopupOpen}
        onClose={() => setTemplatesPopupOpen(false)}
        onImport={handleImportTemplate}
        onDelete={handleTemplateDeleted}
      />

      <GeneratedScriptFeedbackPopUp
        isOpen={feedbackPopupOpen}
        onClose={() => setFeedbackPopupOpen(false)}
        generated={feedbackTarget}
        onImprovised={handleImprovised}
      />

      <ConformationMessagePopUp
        isOpen={!!deleteTarget}
        onClose={() => !deletingScript && setDeleteTarget(null)}
        onConfirm={confirmDeleteGeneratedScript}
        title="Delete Generated Script"
        message={`Are you sure you want to delete "${deleteTarget?.topic}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        confirming={deletingScript}
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
