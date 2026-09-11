import { Search, X } from "lucide-react";

interface LibrarySearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  count: number;
}

export default function LibrarySearch({ value, onChange, label, count }: LibrarySearchProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p role="status" className="text-sm text-slate-500 dark:text-slate-400">{count} {count === 1 ? "result" : "results"}{value.trim() ? " matching your search" : " in your library"}</p>
      <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20 dark:border-white/10 dark:bg-surface sm:max-w-sm">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
        <input type="search" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder={label} className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 dark:text-white" />
        {value && <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="rounded-lg p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-400/10 dark:hover:text-brand-300"><X className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
