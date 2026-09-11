"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** Plural noun for the "Showing X–Y of Z {itemLabel}" line, e.g. "characters". */
  itemLabel: string;
}

export const Pagination = ({ page, pageCount, totalItems, pageSize, onChange, itemLabel }: PaginationProps) => {
  if (pageCount <= 1) return null;

  const firstShown = (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, totalItems);
  const arrowClass =
    "inline-flex min-h-10 min-w-10 items-center justify-center p-2 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-surface text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none";

  return (
    <nav aria-label={`${itemLabel} pagination`} className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-xs text-slate-400 dark:text-slate-500">
        Showing {firstShown}–{lastShown} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={arrowClass}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={arrowClass}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
