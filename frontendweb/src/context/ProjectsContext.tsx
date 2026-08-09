"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export interface ProjectListItem {
  id: string;
  name: string;
}

interface ProjectsContextType {
  projects: ProjectListItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  createProject: (name: string, script?: string) => Promise<ProjectListItem>;
  renameProject: (id: string, name: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export const ProjectsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/projects/");
      const data = await res.json();
      setProjects(data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
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
        if (!cancelled) setProjects(data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
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
    const created = await res.json();
    const item: ProjectListItem = { id: created.id, name: created.name };
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

  return (
    <ProjectsContext.Provider value={{ projects, loading, refresh, createProject, renameProject, removeProject }}>
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
