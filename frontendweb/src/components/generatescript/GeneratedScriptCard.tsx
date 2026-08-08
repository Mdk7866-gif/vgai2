"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, FileText, FolderInput, RefreshCcw, Users } from "lucide-react";
import type { GeneratedScript } from "@/types/scripttemplate";

interface GeneratedScriptCardProps {
  generated: GeneratedScript;
  onImport: (generated: GeneratedScript) => void;
  onImprovise: (generated: GeneratedScript) => void;
}

const characterLine = (c: GeneratedScript["characters"][number]) => {
  const parts = [c.name];
  const details = [c.age != null ? `${c.age}` : null, c.gender, c.profession].filter(Boolean);
  if (details.length) parts.push(details.join(", "));
  return parts.join(": ");
};

export const GeneratedScriptCard = ({ generated, onImport, onImprovise }: GeneratedScriptCardProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
            {generated.topic}
          </h3>
        </div>
        <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300 tabular-nums">
          {generated.word_count} words
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div
          className={`text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 overflow-y-auto ${
            expanded ? "max-h-[32rem]" : "max-h-40"
          }`}
        >
          {generated.script}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer -mt-2"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Collapse script" : "Expand script"}
        </button>

        {generated.characters.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              <Users className="w-3.5 h-3.5" />
              Characters Involved
            </div>
            <div className="flex flex-wrap gap-2">
              {generated.characters.map((c, i) => (
                <span
                  key={`${c.name}-${i}`}
                  className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30"
                >
                  {characterLine(c)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onImport(generated)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 cursor-pointer"
          >
            <FolderInput className="w-4 h-4" />
            Import
          </button>
          <button
            type="button"
            onClick={() => onImprovise(generated)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/70 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCcw className="w-4 h-4" />
            Improvise
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneratedScriptCard;
