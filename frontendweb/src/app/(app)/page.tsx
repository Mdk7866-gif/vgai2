"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenText, Clapperboard, Download, FolderOpen, Loader2, Palette, Plus, Users } from "lucide-react";
import HomePageAllowOnlyTheseUserAccessCard from "@/components/HomePageAllowOnlyTheseUserAccessCard";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import LibrarySearch from "@/components/LibrarySearch";
import { useAuth } from "@/context/AuthContext";
import { useProjects } from "@/context/ProjectsContext";

const steps = [
  { title: "Start with a script", icon: BookOpenText, heading: "Your story is the starting point.", copy: "Paste your own script into a project, or use the script studio to research topics and write one.", detail: "For explainers, stories, documentaries, and short-form videos." },
  { title: "Create each scene", icon: Clapperboard, heading: "Turn words into visual scenes.", copy: "Split the script into scenes. Choose reusable characters and a visual style, then generate images and animations.", detail: "Edit prompts, regenerate a scene, or upload your own media." },
  { title: "Download your assets", icon: Download, heading: "Ready for your video editor.", copy: "Download scene images, animations, and the thumbnail. Assemble the final video in your preferred editing software.", detail: "vgAI creates the assets — it does not export a finished edited video." },
];

export default function Home() {
  const router = useRouter();
  const { user, requireAuth, accessMode, loading: authLoading } = useAuth();
  const { projects, loading, createProject } = useProjects();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const fullName = user?.user_metadata?.full_name;
  const firstName = typeof fullName === "string" ? fullName.trim().split(/\s+/)[0] : "";
  const returning = Boolean(user && projects.length);
  const inviteOnly = !authLoading && !user && accessMode === "allowed_only";
  const newestFirst = [...projects].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  const newest = newestFirst[0];
  const filtered = newestFirst.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  const activeStep = steps[step];
  const StepIcon = activeStep.icon;

  const createNewProject = async () => {
    if (creatingRef.current || !requireAuth()) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const project = await createProject(`Untitled project ${projects.length + 1}`);
      router.push(`/project_folder/${project.id}`);
    } catch (error) {
      setAlert(error instanceof Error ? error.message : "Could not create the project. Please try again.");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <div className="home-page space-y-8 pb-12">
      <section className="home-intro grid items-center gap-8 rounded-[2rem] border border-slate-200/80 bg-white p-6 sm:p-9 xl:grid-cols-[1.1fr_1fr] xl:p-12 dark:border-white/10 dark:bg-surface">
        <div>
          <p className="eyebrow">{returning ? "Your video studio" : "Script → scenes → video assets"}</p>
          <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-.045em] text-slate-950 sm:text-5xl dark:text-white">
            {returning ? `Welcome back${firstName ? `, ${firstName}` : ""}.` : <>Turn your script into <span className="text-brand-600 dark:text-brand-300">images & animations.</span></>}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            {returning ? "Continue a project below, or start a new story. Your characters and visual styles are ready to reuse." : "vgAI helps video creators break a script into scenes, generate matching visuals, and download the assets for editing. You stay in control of every scene."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {inviteOnly ? (
              <a href="#request-access" className="studio-primary">Request access <ArrowRight className="h-4 w-4" /></a>
            ) : (
              <button onClick={createNewProject} disabled={creating || authLoading} className="studio-primary">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Creating project…" : returning ? "New project" : "Start with my script"}
              </button>
            )}
            <Link href="/generate_script" className="studio-secondary"><BookOpenText className="h-4 w-4" />{returning ? "Script studio" : "Help me write a script"}</Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{inviteOnly ? "Browse the tools now. An approved Google account is required to create." : "Creating a project does not spend credits. Generation costs are shown before you start."}</p>
        </div>
        {!returning ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-6 dark:border-white/10 dark:bg-slate-900">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">How it works · select a step</p>
            <div className="grid grid-cols-3 gap-2" aria-label="Explore the workflow">
              {steps.map((item, index) => (
                <button key={item.title} type="button" aria-pressed={step === index} aria-controls="workflow-detail" onClick={() => setStep(index)} className={`rounded-xl border px-2 py-3 text-left transition ${step === index ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-200" : "border-transparent text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5"}`}>
                  <span className="mb-2 block text-xs font-semibold">0{index + 1}</span><span className="text-xs font-semibold leading-5 sm:text-sm">{item.title}</span>
                </button>
              ))}
            </div>
            <div id="workflow-detail" aria-live="polite" aria-atomic="true" className="min-h-64 pt-6">
              <StepIcon aria-hidden="true" className="mb-4 h-8 w-8 text-brand-500 dark:text-brand-300" />
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{activeStep.heading}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{activeStep.copy}</p>
              <p className="mt-4 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">{activeStep.detail}</p>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-900">
            <FolderOpen className="h-8 w-8 text-brand-500 dark:text-brand-300" />
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Your newest project</p>
            <h2 className="mt-2 truncate text-xl font-semibold text-slate-900 dark:text-white">{newest?.name}</h2>
            {newest && <Link href={`/project_folder/${newest.id}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-300">Open project <ArrowRight className="h-4 w-4" /></Link>}
          </div>
        )}
      </section>

      {inviteOnly && <div id="request-access" className="scroll-mt-6"><HomePageAllowOnlyTheseUserAccessCard /></div>}

      {(user || authLoading) && (
        <section id="your-projects" className="scroll-mt-6 space-y-5" aria-busy={loading || authLoading}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Your projects</h2>
            <Link href="/liked_projects" className="text-sm font-medium text-brand-600 dark:text-brand-300">Liked projects →</Link>
          </div>
          {!loading && !authLoading && projects.length > 0 && <LibrarySearch value={query} onChange={(value) => { setQuery(value); setVisibleCount(6); }} label="Search your projects" count={filtered.length} />}
          {loading || authLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div>
          ) : projects.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-white/15">
              <h3 className="font-semibold text-slate-900 dark:text-white">Your first video starts with a script.</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">Create a project, paste your script, and choose a visual style. You can edit everything as you go.</p>
              <button onClick={createNewProject} disabled={creating} className="studio-primary mt-5"><Plus className="h-4 w-4" />Create a project</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-white/15"><p className="text-slate-600 dark:text-slate-300">No projects match your search.</p><button onClick={() => setQuery("")} className="mt-3 text-sm font-semibold text-brand-600 dark:text-brand-300">Clear search</button></div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, visibleCount).map((project) => (
                  <Link key={project.id} href={`/project_folder/${project.id}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-lg dark:border-white/10 dark:bg-surface dark:hover:border-brand-400/40">
                    <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 dark:from-brand-400/10 dark:to-slate-900">
                      {project.thumbnail_image_url ? <Image src={project.thumbnail_image_url} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover" /> : <Clapperboard className="h-8 w-8 text-brand-400" />}
                    </div>
                    <div className="flex items-center gap-3 p-5"><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-slate-900 dark:text-white">{project.name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Open workspace</p></div><ArrowRight className="h-4 w-4 text-brand-500 transition group-hover:translate-x-1" /></div>
                  </Link>
                ))}
              </div>
              {visibleCount < filtered.length && <button onClick={() => setVisibleCount((count) => count + 6)} className="studio-secondary">Show more projects</button>}
            </>
          )}
        </section>
      )}

      <section aria-label="Reusable creative libraries" className="grid gap-4 sm:grid-cols-2">
        {[{ href: "/characters", icon: Users, title: "Keep your characters consistent", copy: "Browse starter characters or build your own reusable cast." }, { href: "/style_templates", icon: Palette, title: "Choose the look of your video", copy: "Explore starter styles, from cinematic to illustrated." }].map(({ href, icon: Icon, title, copy }) => (
          <Link key={href} href={href} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 dark:border-white/10 dark:bg-surface dark:hover:border-brand-400/40">
            <span className="rounded-xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"><Icon className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{copy}</p></div>
          </Link>
        ))}
      </section>
      <AlertMessagePopUp isOpen={Boolean(alert)} onClose={() => setAlert(null)} title="Could not create project" message={alert ?? ""} type="error" />
    </div>
  );
}
