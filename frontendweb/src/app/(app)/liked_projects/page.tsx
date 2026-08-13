"use client";

import React, { useState } from "react";
import { Heart, LogIn } from "lucide-react";
import CardGridSkeleton from "@/components/CardGridSkeleton";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/context/AuthContext";
import { useProjects, type ProjectListItem } from "@/context/ProjectsContext";
import LikedProjectsCard from "@/components/liked_projects/LikedProjectsCard";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";

const PAGE_SIZE = 10;

export default function LikedProjectsPage() {
  const { user, requireAuth, loading: authLoading } = useAuth();
  const { projects, loading, toggleLike } = useProjects();

  const [unlikingId, setUnlikingId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  // toggleLike updates the same ProjectsContext the sidebar reads from, so
  // unliking here removes the card immediately with no separate re-fetch --
  // that's what keeps this page and the sidebar in sync with no lag.
  const handleUnlike = async (project: ProjectListItem) => {
    setUnlikingId(project.id);
    try {
      await toggleLike(project.id, false);
    } catch (err) {
      setAlert({ title: "Failed to unlike project", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setUnlikingId(null);
    }
  };

  const likedProjects = projects.filter((p) => p.is_liked);
  const { page, setPage, pageCount, pageItems, totalItems } = usePagination(likedProjects, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-8 pb-16 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Liked Projects
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
          Project folders you&apos;ve liked, from the sidebar or the project view.
        </p>
      </div>

      {!authLoading && !user ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Heart className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Login to view your liked projects</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Liked projects are tied to your account.
          </p>
          <button
            onClick={() => requireAuth()}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        </div>
      ) : loading ? (
        <CardGridSkeleton
          variant="media"
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          count={PAGE_SIZE}
        />
      ) : likedProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <Heart className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No liked projects yet</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Tap the heart on a project in the sidebar to see it here.
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {pageItems.map((project) => (
              <LikedProjectsCard
                key={project.id}
                project={project}
                onUnlike={handleUnlike}
                unliking={unlikingId === project.id}
              />
            ))}
          </div>
          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            itemLabel="liked projects"
            onChange={setPage}
          />
        </div>
      )}

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
