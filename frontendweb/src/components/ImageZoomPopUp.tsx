"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import Image from "next/image";
import { X, ZoomIn, ZoomOut, RotateCcw, Loader2 } from "lucide-react";

interface ImageZoomPopUpProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;

export default function ImageZoomPopUp({ isOpen, onClose, imageUrl, alt = "Image" }: ImageZoomPopUpProps) {
    const [loading, setLoading] = useState(true);
    // Rendered scale for the badge — updated via RAF to avoid layout thrash
    const [displayScale, setDisplayScale] = useState(1);

    // ── All gesture state lives in refs so handlers never go stale ──
    const scale = useRef(1);
    const pos = useRef({ x: 0, y: 0 });
    const imgWrapRef = useRef<HTMLDivElement>(null);

    // Mouse drag
    const isDragging = useRef(false);
    const [isDraggingState, setIsDraggingState] = useState(false);
    const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

    // Touch pinch
    const pinchOrigin = useRef({ dist: 0, scale: 1, cx: 0, cy: 0, px: 0, py: 0 });
    const isPinching = useRef(false);

    // Touch pan (single finger)
    const isPanning = useRef(false);
    const panOrigin = useRef({ tx: 0, ty: 0, px: 0, py: 0 });

    // Double-tap detection
    const lastTapTime = useRef(0);

    // ── Apply transform directly on DOM node (no React re-render) ──
    const applyTransform = useCallback((animated = false) => {
        const el = imgWrapRef.current;
        if (!el) return;
        const s = scale.current;
        const { x, y } = pos.current;
        el.style.transition = animated ? "transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)" : "none";
        el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
        setDisplayScale(s);
    }, []);

    const clampPos = useCallback(() => {
        // When scale === 1 always re-centre; otherwise clamp to avoid over-panning
        if (scale.current <= 1) {
            pos.current = { x: 0, y: 0 };
            return;
        }
        const el = imgWrapRef.current;
        if (!el) return;
        const { offsetWidth: w, offsetHeight: h } = el;
        const maxX = (w * (scale.current - 1)) / 2;
        const maxY = (h * (scale.current - 1)) / 2;
        pos.current.x = Math.max(-maxX, Math.min(maxX, pos.current.x));
        pos.current.y = Math.max(-maxY, Math.min(maxY, pos.current.y));
    }, []);

    const resetView = useCallback((animated = true) => {
        scale.current = 1;
        pos.current = { x: 0, y: 0 };
        applyTransform(animated);
    }, [applyTransform]);

    // ── Reset whenever popup opens / image changes ──
    useEffect(() => {
        if (isOpen) {
            Promise.resolve().then(() => {
                setLoading(true);
            });
            resetView(false);
        }
    }, [isOpen, imageUrl, resetView]);

    // ── Escape key ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        if (isOpen) window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    // ── Prevent native pinch-zoom / overscroll on the overlay ──
    const overlayRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = overlayRef.current;
        if (!el || !isOpen) return;
        const preventTouch = (e: TouchEvent) => e.preventDefault();
        const preventWheel = (e: WheelEvent) => e.preventDefault();
        el.addEventListener("touchmove", preventTouch, { passive: false });
        el.addEventListener("wheel", preventWheel, { passive: false });
        return () => {
            el.removeEventListener("touchmove", preventTouch);
            el.removeEventListener("wheel", preventWheel);
        };
    }, [isOpen]);

    // ────────────────────────────────────────────────────────────────
    // MOUSE events (desktop)
    // ────────────────────────────────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale.current <= 1) return;
        e.preventDefault();
        isDragging.current = true;
        setIsDraggingState(true);
        dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pos.current.x, py: pos.current.y };
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return;
        pos.current = {
            x: dragOrigin.current.px + (e.clientX - dragOrigin.current.mx),
            y: dragOrigin.current.py + (e.clientY - dragOrigin.current.my),
        };
        clampPos();
        applyTransform();
    }, [applyTransform, clampPos]);

    const onMouseUp = useCallback(() => {
        isDragging.current = false;
        setIsDraggingState(false);
    }, []);

    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        scale.current = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.current + delta));
        clampPos();
        applyTransform(false);
    }, [applyTransform, clampPos]);

    const onDoubleClick = useCallback(() => {
        if (scale.current > 1) {
            resetView(true);
        } else {
            scale.current = 2.5;
            applyTransform(true);
        }
    }, [applyTransform, resetView]);

    // ────────────────────────────────────────────────────────────────
    // TOUCH events (mobile)
    // ────────────────────────────────────────────────────────────────
    const getTouchDist = (t: React.TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const getTouchMid = (t: React.TouchList) => ({
        cx: (t[0].clientX + t[1].clientX) / 2,
        cy: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            // Begin pinch
            isPinching.current = true;
            isPanning.current = false;
            const dist = getTouchDist(e.touches);
            const { cx, cy } = getTouchMid(e.touches);
            pinchOrigin.current = { dist, scale: scale.current, cx, cy, px: pos.current.x, py: pos.current.y };
        } else if (e.touches.length === 1) {
            isPinching.current = false;

            // Double-tap detection
            const now = Date.now();
            if (now - lastTapTime.current < DOUBLE_TAP_MS) {
                lastTapTime.current = 0;
                if (scale.current > 1) {
                    resetView(true);
                } else {
                    scale.current = 2.5;
                    applyTransform(true);
                }
                return;
            }
            lastTapTime.current = now;

            if (scale.current > 1) {
                isPanning.current = true;
                const t = e.touches[0];
                panOrigin.current = { tx: t.clientX, ty: t.clientY, px: pos.current.x, py: pos.current.y };
            }
        }
    }, [applyTransform, resetView]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2 && isPinching.current) {
            const dist = getTouchDist(e.touches);
            const ratio = dist / (pinchOrigin.current.dist || 1);
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchOrigin.current.scale * ratio));

            // Pinch around the midpoint
            const { cx, cy } = getTouchMid(e.touches);
            const scaleDiff = newScale - pinchOrigin.current.scale;

            scale.current = newScale;
            pos.current = {
                x: pinchOrigin.current.px + (cx - pinchOrigin.current.cx) * scaleDiff * 0.5,
                y: pinchOrigin.current.py + (cy - pinchOrigin.current.cy) * scaleDiff * 0.5,
            };
            clampPos();
            applyTransform();
        } else if (e.touches.length === 1 && isPanning.current) {
            const t = e.touches[0];
            pos.current = {
                x: panOrigin.current.px + (t.clientX - panOrigin.current.tx),
                y: panOrigin.current.py + (t.clientY - panOrigin.current.ty),
            };
            clampPos();
            applyTransform();
        }
    }, [applyTransform, clampPos]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            if (isPinching.current) {
                isPinching.current = false;
                // If pinch brought scale back to 1, snap to centre
                if (scale.current <= 1.05) {
                    resetView(true);
                    return;
                }
                // If one finger is still down, prime pan
                if (e.touches.length === 1) {
                    isPanning.current = true;
                    const t = e.touches[0];
                    panOrigin.current = { tx: t.clientX, ty: t.clientY, px: pos.current.x, py: pos.current.y };
                }
            } else {
                isPanning.current = false;
            }
        }
    }, [resetView]);

    // ────────────────────────────────────────────────────────────────
    // Button handlers
    // ────────────────────────────────────────────────────────────────
    const zoomIn = useCallback(() => {
        scale.current = Math.min(MAX_SCALE, scale.current + 0.5);
        clampPos();
        applyTransform(true);
    }, [applyTransform, clampPos]);

    const zoomOut = useCallback(() => {
        scale.current = Math.max(MIN_SCALE, scale.current - 0.5);
        if (scale.current <= 1) {
            resetView(true);
        } else {
            clampPos();
            applyTransform(true);
        }
    }, [applyTransform, clampPos, resetView]);

    if (!isOpen) return null;

    const isZoomed = displayScale > 1;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
            style={{ touchAction: "none" }}
        >
            {/* ── Top Controls ── */}
            <div
                className="absolute top-3 right-3 z-50 flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <button
                    onClick={zoomIn}
                    className="p-2.5 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-zinc-700 transition-all active:scale-90 rounded-sm"
                    title="Zoom In"
                >
                    <ZoomIn className="h-4 w-4" />
                </button>
                <button
                    onClick={zoomOut}
                    className="p-2.5 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-zinc-700 transition-all active:scale-90 rounded-sm"
                    title="Zoom Out"
                >
                    <ZoomOut className="h-4 w-4" />
                </button>
                <button
                    onClick={() => resetView(true)}
                    className="p-2.5 bg-zinc-900/90 hover:bg-zinc-800 text-white border border-zinc-700 transition-all active:scale-90 rounded-sm"
                    title="Reset View"
                >
                    <RotateCcw className="h-4 w-4" />
                </button>
                <button
                    onClick={onClose}
                    className="p-2.5 bg-white text-black hover:bg-zinc-100 border border-white transition-all active:scale-90 font-bold rounded-sm"
                    title="Close"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* ── Scale Badge ── */}
            <div className="absolute top-3 left-3 z-50 pointer-events-none bg-black/70 px-3 py-1.5 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-300 rounded-sm">
                {Math.round(displayScale * 100)}%
            </div>

            {/* ── Loading Overlay ── */}
            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90">
                    <Loader2 className="h-10 w-10 animate-spin text-indigo-400 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Loading...</p>
                </div>
            )}

            {/* ── Viewport — captures all pointer events ── */}
            <div
                className="relative w-full h-full flex items-center justify-center overflow-hidden"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onDoubleClick={onDoubleClick}
                onClick={(e) => {
                    // Only close if clicked directly on the dark backdrop (not the image wrapper)
                    if (e.target === e.currentTarget && !isZoomed) onClose();
                }}
                style={{ cursor: isZoomed ? (isDraggingState ? "grabbing" : "grab") : "zoom-in" }}
            >
                {/* ── Image Wrapper — transformed via ref ── */}
                <div
                    ref={imgWrapRef}
                    style={{
                        transform: "translate(0px, 0px) scale(1)",
                        transformOrigin: "center center",
                        willChange: "transform",
                        userSelect: "none",
                        touchAction: "none",
                    }}
                >
                    <Image
                        src={imageUrl}
                        alt={alt}
                        width={1600}
                        height={1200}
                        priority
                        loading="eager"
                        onLoad={() => setLoading(false)}
                        className="object-contain max-h-[88vh] max-w-[95vw] select-none pointer-events-none block"
                        draggable={false}
                    />
                </div>
            </div>

            {/* ── Hint Bar ── */}
            {!isZoomed && !loading && (
                <p className="absolute bottom-4 left-0 right-0 text-center text-[9px] font-black uppercase tracking-widest text-zinc-600 pointer-events-none">
                    Pinch · Scroll · Double-tap to zoom &nbsp;·&nbsp; Drag when zoomed &nbsp;·&nbsp; Esc to close
                </p>
            )}
        </div>
    );
}
