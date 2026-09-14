import Link from "next/link";
import { ArrowRight, Clapperboard, Layers3, SlidersHorizontal, Users } from "lucide-react";

const principles = [
  { icon: SlidersHorizontal, title: "You stay in the director’s chair", copy: "Edit a prompt, regenerate one scene, or upload your own media. Creative decisions stay with you." },
  { icon: Users, title: "Build once. Create again.", copy: "Save characters and visual styles in your library, then bring them into your next project." },
  { icon: Layers3, title: "A workflow, not a black box", copy: "Move from script to scenes to downloadable assets, with room to review and refine at every step." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      <section className="relative overflow-hidden rounded-[2rem] border border-brand-200/60 bg-gradient-to-br from-white via-brand-50 to-cyan-50 p-7 dark:border-white/10 dark:from-surface dark:via-surface dark:to-slate-900 sm:p-12">
        <Clapperboard aria-hidden="true" className="mb-8 h-10 w-10 text-brand-500" />
        <p className="eyebrow">Behind vgAI2</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-[-.045em] text-slate-950 dark:text-white sm:text-6xl">More room for the story.<br /><span className="text-brand-600 dark:text-brand-300">Less friction creating it.</span></h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">vgAI2 is a scene-by-scene production studio for video creators. It brings scripts, reusable characters, visual styles, and AI-generated media into one organized workspace.</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-action-foreground transition hover:bg-action-hover">Explore the studio <ArrowRight className="h-4 w-4" /></Link>
      </section>
      <section aria-label="Our approach" className="grid gap-4 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, copy }) => (
          <article key={title} className="rounded-3xl border border-slate-200/80 bg-white p-6 dark:border-white/10 dark:bg-surface">
            <span className="inline-flex rounded-2xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"><Icon className="h-5 w-5" /></span>
            <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">{copy}</p>
          </article>
        ))}
      </section>
      <section className="flex flex-col justify-between gap-5 rounded-3xl bg-slate-950 p-7 text-white sm:flex-row sm:items-center sm:p-9">
        <div><h2 className="text-xl font-semibold">Made for your creative process.</h2><p className="mt-2 text-sm leading-6 text-slate-400">Have a question or an idea that would make the studio better?</p></div>
        <Link href="/contact" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold transition hover:bg-white/10">Get in touch <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}
