"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Download, Check } from "lucide-react";
import { AssetUnavailableError, downloadAsset } from "@/lib/download";

interface VideoPlayingCardPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  filename?: string;
}

export default function VideoPlayingCardPopUp({ isOpen, onClose, videoUrl, filename }: VideoPlayingCardPopUpProps) {
  const [loading, setLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "loading" | "done">("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen) Promise.resolve().then(() => setLoading(true));
  }, [isOpen, videoUrl]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      videoRef.current?.pause();
      Promise.resolve().then(() => setDownloadError(null));
    }
  }, [isOpen]);

  const handleDownload = async () => {
    setDownloadStatus("loading");
    setDownloadError(null);
    try {
      await downloadAsset(videoUrl, filename || "animation.mp4");
      setDownloadStatus("done");
    } catch (err) {
      setDownloadStatus("idle");
      setDownloadError(
        err instanceof AssetUnavailableError
          ? `Couldn't download — the media host refused the file (HTTP ${err.status}).`
          : "Couldn't download — the file couldn't be reached."
      );
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute top-3 right-3 z-50 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleDownload}
          disabled={downloadStatus === "loading"}
          aria-label="Download animation"
          className={`p-2.5 text-white border transition-all active:scale-90 rounded-xl ${
            downloadStatus === "done"
              ? "bg-emerald-600/90 hover:bg-emerald-600 border-emerald-500"
              : "bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700"
          }`}
          title="Download animation"
        >
          {downloadStatus === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : downloadStatus === "done" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onClose}
          aria-label="Close animation preview"
          className="min-h-11 min-w-11 p-2.5 bg-white text-black hover:bg-zinc-100 border border-white transition-all active:scale-90 font-bold rounded-xl"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90 pointer-events-none">
          <Loader2 className="h-10 w-10 animate-spin text-brand-400 mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Loading...</p>
        </div>
      )}

      {downloadError && (
        <p className="absolute bottom-4 left-0 right-0 z-50 text-center text-xs text-red-400 px-4 pointer-events-none">
          {downloadError}
        </p>
      )}

      <div
        className="relative w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          autoPlay
          onCanPlay={() => setLoading(false)}
          className="max-h-[88vh] max-w-[95vw] object-contain"
        />
      </div>
    </div>,
    document.body
  );
}
