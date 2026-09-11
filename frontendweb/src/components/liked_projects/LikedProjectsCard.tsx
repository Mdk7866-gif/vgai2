"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Folder, Heart, Loader2 } from "lucide-react";
import type { ProjectListItem } from "@/context/ProjectsContext";

interface LikedProjectsCardProps {
  project: ProjectListItem;
  onUnlike: (project: ProjectListItem) => void;
  unliking?: boolean;
}

const formatCreatedDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export const LikedProjectsCard = ({ project, onUnlike, unliking = false }: LikedProjectsCardProps) => {
  return (
    <div className="group bg-white dark:bg-surface border border-slate-200/80 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm hover:border-brand-300 dark:hover:border-brand-400/40 hover:shadow-xl hover:shadow-brand-950/10 motion-safe:hover:-translate-y-1 transition-all duration-200">
      <div className="relative">
      <Link href={`/project_folder/${project.id}`} className="relative block w-full aspect-video bg-slate-100 dark:bg-slate-900">
        {project.thumbnail_image_url ? (
          <Image
            src={project.thumbnail_image_url}
            alt={project.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-100 via-brand-50 to-cyan-100 dark:from-brand-500/20 dark:via-slate-900 dark:to-cyan-500/10">
            <Folder className="w-12 h-12 text-brand-400 dark:text-brand-300" />
          </div>
        )}

      </Link>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnlike(project);
          }}
          disabled={unliking}
          aria-label={`Unlike ${project.name}`}
          className="absolute top-2.5 right-2.5 p-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-red-500 shadow-sm hover:shadow hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {unliking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5 fill-current" />}
        </button>
      </div>

      <div className="p-5">
        <Link href={`/project_folder/${project.id}`} className="flex items-center gap-1.5 min-w-0">
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-amber-500 fill-amber-400/70" />
          <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">{project.name}</h3>
        </Link>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Created {formatCreatedDate(project.created_at)}
        </p>
      </div>
    </div>
  );
};

export default LikedProjectsCard;
