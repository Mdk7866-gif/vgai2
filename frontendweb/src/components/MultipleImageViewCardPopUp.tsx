"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface MultipleImageViewCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrls: string[];
  initialIndex?: number;
  title: string;
}

/** Full-screen gallery for a starter template's ordered demo images. */
export default function MultipleImageViewCardPopUp({
  isOpen,
  onClose,
  imageUrls,
  initialIndex = 0,
  title,
}: MultipleImageViewCardPopUpProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const imageCount = imageUrls.length;
  const hasMultipleImages = imageCount > 1;
  const goTo = (index: number) => setActiveIndex((index + imageCount) % imageCount);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (hasMultipleImages && event.key === "ArrowLeft") setActiveIndex((index) => (index - 1 + imageCount) % imageCount);
      if (hasMultipleImages && event.key === "ArrowRight") setActiveIndex((index) => (index + 1) % imageCount);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasMultipleImages, imageCount, isOpen, onClose]);

  if (!isOpen || !imageCount) return null;
  const imageUrl = imageUrls[activeIndex];

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/95 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`${title} demo gallery`} onClick={onClose}>
      <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-3 text-white sm:inset-x-6 sm:top-6">
        <div><p className="text-sm font-semibold">{title}</p><p className="text-xs text-zinc-400">Demo image {activeIndex + 1} of {imageCount}{hasMultipleImages ? " · Use ← → keys to browse" : ""}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg bg-white p-2.5 text-black transition hover:bg-zinc-100" aria-label="Close gallery"><X className="h-4 w-4" /></button>
      </div>
      {hasMultipleImages && <button type="button" onClick={(event) => { event.stopPropagation(); goTo(activeIndex - 1); }} className="absolute left-3 z-20 rounded-full border border-zinc-700 bg-zinc-900/90 p-3 text-white transition hover:bg-zinc-800 sm:left-6" aria-label="Previous demo image"><ChevronLeft className="h-6 w-6" /></button>}
      <div className="relative flex h-[84vh] w-full max-w-7xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <Image key={imageUrl} src={imageUrl} alt={`${title} demo image ${activeIndex + 1}`} width={1920} height={1920} priority unoptimized className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
      </div>
      {hasMultipleImages && <button type="button" onClick={(event) => { event.stopPropagation(); goTo(activeIndex + 1); }} className="absolute right-3 z-20 rounded-full border border-zinc-700 bg-zinc-900/90 p-3 text-white transition hover:bg-zinc-800 sm:right-6" aria-label="Next demo image"><ChevronRight className="h-6 w-6" /></button>}
      {hasMultipleImages && <div className="absolute bottom-5 flex max-w-[80vw] gap-2 overflow-x-auto rounded-xl bg-black/50 p-2" onClick={(event) => event.stopPropagation()}>{imageUrls.map((url, index) => <button key={url} type="button" onClick={() => setActiveIndex(index)} className={`relative h-12 w-16 flex-none overflow-hidden rounded-md ring-2 transition ${index === activeIndex ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"}`} aria-label={`Show demo image ${index + 1}`} aria-pressed={index === activeIndex}><Image src={url} alt="" fill unoptimized className="object-cover" /></button>)}</div>}
    </div>,
    document.body,
  );
}
