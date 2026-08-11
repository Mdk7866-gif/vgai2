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
    <div className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200">
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
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
            <Folder className="w-10 h-10 text-amber-500 fill-amber-400/70" />
          </div>
        )}

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
      </Link>

      <div className="p-4">
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
