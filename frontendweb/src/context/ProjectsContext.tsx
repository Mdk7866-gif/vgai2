"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export interface ProjectListItem {
  id: string;
  name: string;
  is_liked: boolean;
  thumbnail_image_url: string | null;
  created_at: string;
}

interface ProjectsContextType {
  projects: ProjectListItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  createProject: (name: string, script?: string) => Promise<ProjectListItem>;
  renameProject: (id: string, name: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  toggleLike: (id: string, liked: boolean) => Promise<void>;
}

interface ProjectRow {
  id: string;
  name: string;
  is_liked: boolean;
  thumbnail_image_url: string | null;
  created_at: string;
}

const toListItem = (p: ProjectRow): ProjectListItem => ({
  id: p.id,
  name: p.name,
  is_liked: p.is_liked,
  thumbnail_image_url: p.thumbnail_image_url,
  created_at: p.created_at,
});

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export const ProjectsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/projects/");
      const data = await res.json();
      setProjects(data.map(toListItem));
    } catch {
      // Non-fatal: sidebar just shows whatever it last had.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => {
        setProjects([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    authFetch("/projects/")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProjects(data.map(toListItem));
      })
      .catch(() => {
        // Non-fatal: sidebar just shows whatever it last had.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const createProject = useCallback(async (name: string, script?: string) => {
    const res = await authFetch("/projects/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, script }),
    });
    const created: ProjectRow = await res.json();
    const item = toListItem(created);
    setProjects((prev) => [item, ...prev]);
    return item;
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    await authFetch(`/projects/update/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const removeProject = useCallback(async (id: string) => {
    await authFetch(`/projects/delete/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Single source of truth for is_liked -- the sidebar and /liked_projects both
  // read from this same context, so an optimistic update here is what keeps them
  // in sync with no lag rather than each page holding its own copy.
  const toggleLike = useCallback(async (id: string, liked: boolean) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, is_liked: liked } : p)));
    try {
      await authFetch(`/projects/update/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_liked: liked }),
      });
    } catch (err) {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, is_liked: !liked } : p)));
      throw err;
    }
  }, []);

  return (
    <ProjectsContext.Provider
      value={{ projects, loading, refresh, createProject, renameProject, removeProject, toggleLike }}
    >
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within a ProjectsProvider");
  }
  return context;
};
