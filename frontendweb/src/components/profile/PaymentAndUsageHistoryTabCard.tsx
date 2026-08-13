"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Activity,
  Brain,
  Film,
  Folder,
  Image as ImageIcon,
  Mic,
  Receipt,
  Sparkles,
} from "lucide-react";
import { authFetch } from "@/lib/api";
import CreditCoinIcon from "@/components/CreditCoinIcon";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import type {
  PaymentHistoryResponse,
  PaymentStatus,
  ProjectUsageRecord,
  UsageHistoryResponse,
} from "@/types/profile";

type Tab = "payment" | "usage";

const TABS = [
  { id: "payment" as const, label: "Payment History", Icon: Receipt },
  { id: "usage" as const, label: "Usage History", Icon: Activity },
];

/** Per-project spend fields, in the order they're shown in the hover breakdown. */
const PROJECT_BREAKDOWN = [
  { key: "llm_credit_spent", label: "LLM", Icon: Brain },
  { key: "image_credit_spent", label: "Image", Icon: ImageIcon },
  { key: "animation_credit_spent", label: "Animation", Icon: Film },
  { key: "voiceover_credit_spent", label: "Voiceover", Icon: Mic },
] as const;

/** The same four categories totalled across every project, plus the
 *  non-project spend that only exists at the user level. */
const TOTAL_BREAKDOWN = [
  { key: "total_llm_credit_spent", label: "LLM", Icon: Brain },
  { key: "total_image_credit_spent", label: "Image", Icon: ImageIcon },
  { key: "total_animation_credit_spent", label: "Animation", Icon: Film },
  { key: "total_voiceover_credit_spent", label: "Voiceover", Icon: Mic },
  { key: "total_miscellaneous_credit_spent", label: "Miscellaneous", Icon: Sparkles },
] as const;

const STATUS_STYLES: Record<PaymentStatus, string> = {
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30",
  pending:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30",
  failed:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30",
  refunded:
    "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600/40",
};

const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$" };

/** Rows per page. Both tabs paginate client-side: one fetch already returns the
 *  whole history, and the totals have to be computed across *all* rows anyway,
 *  so slicing here avoids a second aggregate query per page turn. It also keeps
 *  the card a predictable height — see ROW_HEIGHT_PX. */
const PAGE_SIZE = 10;

/** Height of one rendered row, measured in the browser. The loading skeleton
 *  draws PAGE_SIZE rows at this height so the card reserves the space a full
 *  page will actually occupy, instead of snapping open from a bare spinner. */
const ROW_HEIGHT_PX = 49;

// Popover box is measured rather than guessed only where it matters — its width
// and a worst-case height, both used to keep it inside the viewport.
const POPOVER_WIDTH = 268;
const POPOVER_MAX_HEIGHT = 220;

function formatCredits(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(amount: number, currency: string): string {
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${formatted}` : `${formatted} ${currency}`;
}

// Postgres `timestamp` columns come back without a zone, so Date parses them as
// local time. Fine here — these are only ever rendered as a calendar date.
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

interface PopoverState {
  record: ProjectUsageRecord;
  top: number;
  left: number;
}

/** Placeholder shaped like a full page of rows, so the card occupies roughly its
 *  loaded height from the first paint rather than growing once data lands. */
const HistorySkeleton = () => (
  <div className="animate-pulse" aria-hidden="true">
    <div className="flex items-center justify-between gap-4 pb-3">
      {["w-16", "w-14", "w-24", "w-12"].map((width) => (
        <div key={width} className={`h-2.5 rounded bg-slate-200/70 dark:bg-slate-700/50 ${width}`} />
      ))}
    </div>
    {Array.from({ length: PAGE_SIZE }).map((_, index) => (
      <div
        key={index}
        style={{ height: ROW_HEIGHT_PX }}
        className="flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-700/50"
      >
        <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-700/40" />
        <div className="h-5 w-16 rounded-full bg-slate-100 dark:bg-slate-700/40" />
        <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-700/40" />
        <div className="h-3 w-12 rounded bg-slate-100 dark:bg-slate-700/40" />
      </div>
    ))}
  </div>
);

const EmptyState = ({
  Icon,
  title,
  message,
}: {
  Icon: React.ElementType;
  title: string;
  message: string;
}) => (
  <div className="flex flex-col items-center justify-center text-center gap-2 py-14">
    <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 flex items-center justify-center">
      <Icon className="w-5 h-5" />
    </div>
    <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">{message}</p>
  </div>
);

export const PaymentAndUsageHistoryTabCard = () => {
  const [tab, setTab] = useState<Tab>("payment");
  const [payment, setPayment] = useState<PaymentHistoryResponse | null>(null);
  const [usage, setUsage] = useState<UsageHistoryResponse | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Tab, string>>>({});
  const [popover, setPopover] = useState<PopoverState | null>(null);
  // Called unconditionally for both tabs regardless of which is active — the
  // render functions below are plain helpers invoked conditionally on `tab`,
  // so a hook call couldn't live inside them without violating the rules of
  // hooks (the call count would differ between renders).
  const paymentPagination = usePagination(payment?.topups ?? [], PAGE_SIZE);
  const usagePagination = usePagination(usage?.projects ?? [], PAGE_SIZE);

  // Derived rather than stored: a `loading` state would have to be set
  // synchronously inside the effect below for the already-cached case, which is
  // the cascading-render pattern react-hooks/set-state-in-effect flags.
  const error = errors[tab];
  const loading = !(tab === "payment" ? payment : usage) && !error;

  useEffect(() => {
    // Each tab fetches once on first visit and is then cached in state, so
    // switching back and forth doesn't re-hit the backend. The parent remounts
    // this component with a fresh `key` after a successful top-up, which is
    // what invalidates that cache.
    if (tab === "payment" ? payment : usage) return;
    // A tab that already failed waits for an explicit retry (which clears its
    // entry here) instead of hammering the backend on every tab switch.
    if (errors[tab]) return;

    let cancelled = false;

    authFetch(tab === "payment" ? "/payments/history" : "/profile/usage-history")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (tab === "payment") setPayment(data);
        else setUsage(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setErrors((prev) => ({ ...prev, [tab]: message }));
      });

    return () => {
      cancelled = true;
    };
  }, [tab, payment, usage, errors]);

  useEffect(() => {
    // The popover is positioned in viewport coordinates, so it would drift away
    // from its row on scroll/resize — close it instead of trying to follow.
    if (!popover) return;
    const close = () => setPopover(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [popover]);

  const openPopover = (record: ProjectUsageRecord, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    // Clamped as it's set rather than at render time, so it can't hang off the
    // right edge or run past the bottom of a short viewport.
    const flipAbove = rect.bottom + POPOVER_MAX_HEIGHT + 12 > window.innerHeight;
    setPopover({
      record,
      top: flipAbove ? Math.max(12, rect.top - POPOVER_MAX_HEIGHT - 8) : rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)),
    });
  };

  const renderPaymentTab = (data: PaymentHistoryResponse) => {
    if (data.topups.length === 0) {
      return (
        <EmptyState
          Icon={Receipt}
          title="No payments yet"
          message="Credit top-ups you make will show up here."
        />
      );
    }

    // Every row is INR today (see PAISE_PER_CREDIT in payments/crud.py); read
    // the symbol off a real row anyway so this survives multi-currency later.
    const currency =
      data.topups.find((topup) => topup.payment_status === "success")?.currency ?? "INR";

    const { page, pageCount, pageItems: visible, setPage } = paymentPagination;

    return (
      <>
        <div className="overflow-x-auto -mx-5 px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <th className="pb-3 text-left font-medium">Date</th>
                <th className="pb-3 text-left font-medium">Status</th>
                <th className="pb-3 text-right font-medium">Amount Paid</th>
                <th className="pb-3 text-right font-medium">Credits</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((topup) => (
                <tr key={topup.id}>
                  <td className="py-3 border-t border-slate-100 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {formatDate(topup.created_at)}
                  </td>
                  <td className="py-3 border-t border-slate-100 dark:border-slate-700/50">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ring-1 ring-inset ${
                        STATUS_STYLES[topup.payment_status] ?? STATUS_STYLES.refunded
                      }`}
                    >
                      {topup.payment_status}
                    </span>
                  </td>
                  <td className="py-3 border-t border-slate-100 dark:border-slate-700/50 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {formatMoney(topup.amount_paid, topup.currency)}
                  </td>
                  <td className="py-3 border-t border-slate-100 dark:border-slate-700/50 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                      <CreditCoinIcon className="w-4 h-4" />
                      {formatCredits(topup.credits_added)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageCount={pageCount}
          totalItems={data.topups.length}
          pageSize={PAGE_SIZE}
          itemLabel="payments"
          onChange={setPage}
        />

        {/* Totals stay across every top-up, not just the visible page. */}
        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700/70 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Total Amount Paid
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              {formatMoney(data.total_amount_paid, currency)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Total Credits Purchased
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCoinIcon className="w-5 h-5" />
              {formatCredits(data.total_credits_purchased)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Totals count successful payments only — pending and failed attempts are listed above but
          were never charged.
        </p>
      </>
    );
  };

  const renderUsageTab = (data: UsageHistoryResponse) => {
    const { page, pageCount, pageItems: visible, setPage } = usagePagination;

    return (
      <>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700/60 p-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200/70 dark:border-slate-700/50">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Total Credit Spent
            </p>
            <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white leading-tight">
              {formatCredits(data.total_credit_spent)}
            </p>
          </div>
          <CreditCoinIcon className="w-8 h-8 flex-shrink-0" />
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {TOTAL_BREAKDOWN.map(({ key, label, Icon }) => (
            <div
              key={key}
              className="rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-3 py-2.5"
            >
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </p>
              <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                {formatCredits(data[key])}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Miscellaneous covers generation outside a project — character sheets, style templates, and
          scripts.
        </p>
      </div>

      {data.projects.length === 0 ? (
        <EmptyState
          Icon={Folder}
          title="No project spend yet"
          message="Once you generate scenes, images, or animations in a project, its credit usage shows up here."
        />
      ) : (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Per Project</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Hover a project for its breakdown
            </p>
          </div>

          <ul className="mt-1">
            {visible.map((record) => (
              <li
                key={record.project_id}
                onMouseEnter={(e) => openPopover(record, e.currentTarget)}
                onMouseLeave={() => setPopover(null)}
                className="flex items-center justify-between gap-3 py-3 border-t border-slate-100 dark:border-slate-700/50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  {record.project_exists ? (
                    <Link
                      href={`/project_folder/${record.project_id}`}
                      className="truncate font-medium text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                    >
                      {record.project_name}
                    </Link>
                  ) : (
                    <>
                      <span className="truncate font-medium text-slate-500 dark:text-slate-400">
                        {record.project_name}
                      </span>
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
                        deleted
                      </span>
                    </>
                  )}
                </div>

                {/* Also a button, not just a hover target, so the breakdown is
                    reachable by tap and by keyboard. */}
                <button
                  type="button"
                  onClick={(e) =>
                    popover?.record.project_id === record.project_id
                      ? setPopover(null)
                      : openPopover(record, e.currentTarget)
                  }
                  className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 -mr-2 rounded-lg font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <CreditCoinIcon className="w-4 h-4" />
                  {formatCredits(record.total_credit_spent)}
                </button>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={data.projects.length}
            pageSize={PAGE_SIZE}
            itemLabel="projects"
            onChange={setPage}
          />
        </div>
      )}
      </>
    );
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700/80">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 sm:px-7 py-3.5 text-sm font-medium transition-colors cursor-pointer ${
                tab === id
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {tab === id && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <HistorySkeleton />
          ) : error ? (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => setErrors((prev) => ({ ...prev, [tab]: undefined }))}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : tab === "payment" ? (
            payment && renderPaymentTab(payment)
          ) : (
            usage && renderUsageTab(usage)
          )}
        </div>
      </div>

      {/* Portaled for the reason every overlay in this app is: the card above
          sits inside ancestors with transforms/backdrop-filters, which would
          otherwise become this fixed element's containing block and clip it. */}
      {popover &&
        createPortal(
          <div
            style={{ top: popover.top, left: popover.left, width: POPOVER_WIDTH }}
            className="fixed z-[90] rounded-xl bg-white dark:bg-slate-800 shadow-xl dark:shadow-slate-950/80 ring-1 ring-slate-200 dark:ring-slate-700 p-4 pointer-events-none"
          >
            <p className="font-medium text-slate-900 dark:text-white truncate">
              {popover.record.project_name}
            </p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {popover.record.project_created_at
                ? `Created ${formatDate(popover.record.project_created_at)}`
                : `First spend ${formatDate(popover.record.first_spend_at)}`}
            </p>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2">
              {PROJECT_BREAKDOWN.map(({ key, label, Icon }) => (
                <div key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {formatCredits(popover.record[key])}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Total</span>
              <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                <CreditCoinIcon className="w-4 h-4" />
                {formatCredits(popover.record.total_credit_spent)}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default PaymentAndUsageHistoryTabCard;
