"use client";

import React from "react";

interface CardGridSkeletonProps {
  /** "media": aspect-video image block + two text lines (Characters, Liked
   *  Projects). "panel": icon+title header row + description body (Style
   *  Templates). Match whichever real card this replaces so the swap doesn't
   *  change the grid's height. */
  variant: "media" | "panel";
  /** Must be the exact grid className the loaded state renders, so cards land
   *  in the same columns/gaps and swapping in real data doesn't reflow. */
  gridClassName: string;
  /** Item count is unknown until the fetch resolves — unlike a paginated list,
   *  nothing here can be pixel-exact. 4 is a deliberately modest default: it
   *  reads as "content is loading" without overshooting so far past a small
   *  library's real count that the grid visibly shrinks once data lands. */
  count?: number;
}

const shimmer = "bg-slate-100 dark:bg-slate-700/40";

const MediaSkeletonCard = () => (
  <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden">
    <div className={`w-full aspect-video ${shimmer}`} />
    <div className="p-4 flex flex-col gap-2">
      <div className={`h-4 w-2/3 rounded ${shimmer}`} />
      <div className={`h-3 w-full rounded ${shimmer}`} />
      <div className={`h-3 w-4/5 rounded ${shimmer}`} />
    </div>
  </div>
);

const PanelSkeletonCard = () => (
  <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden">
    <div className="p-4 pb-3 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/60">
      <div className={`w-10 h-10 flex-shrink-0 rounded-xl ${shimmer}`} />
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className={`h-4 w-1/2 rounded ${shimmer}`} />
        <div className={`h-3 w-24 rounded-full ${shimmer}`} />
      </div>
    </div>
    <div className="p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 min-h-[3.9em] justify-center">
        <div className={`h-3 w-full rounded ${shimmer}`} />
        <div className={`h-3 w-full rounded ${shimmer}`} />
        <div className={`h-3 w-3/4 rounded ${shimmer}`} />
      </div>
      <div className={`h-6 w-24 rounded-full ${shimmer}`} />
    </div>
  </div>
);

export const CardGridSkeleton = ({ variant, gridClassName, count = 4 }: CardGridSkeletonProps) => (
  <div className={`${gridClassName} animate-pulse`} aria-hidden="true">
    {Array.from({ length: count }).map((_, index) =>
      variant === "media" ? <MediaSkeletonCard key={index} /> : <PanelSkeletonCard key={index} />
    )}
  </div>
);

export default CardGridSkeleton;
