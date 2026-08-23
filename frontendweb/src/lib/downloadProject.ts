/**
 * "Download All" for a project folder page: pulls every generated scene
 * image, scene animation, and the video thumbnail down from Cloudinary into a
 * folder structure the user picks --
 *
 *   <chosen folder>/
 *     thumbnail.<ext>
 *     images/scene_01.<ext>, scene_02.<ext>, ...
 *     animation/scene_01.<ext>, scene_02.<ext>, ...
 *
 * Primary path is the File System Access API (`showDirectoryPicker`), which
 * writes real files into a real folder the user chose -- Chrome/Edge only.
 * Where it's unavailable (Firefox, Safari), `runProjectDownload` falls back to
 * building the same structure as a single `.zip` and triggering a normal
 * browser download, so the feature still works everywhere, just without a
 * folder picker.
 *
 * Voiceover is deliberately absent: nothing in the product generates
 * `project_voiceovers` rows yet (see CLAUDE.md), so there is nothing to add a
 * task for. Once voiceover generation ships, fetch those rows and push
 * { category: "voiceover", ... } tasks in buildDownloadTasks() the same way
 * the image/animation loops below do -- nothing else in this module needs to
 * change, since `runPool`/`downloadToDirectory`/`downloadToZip` are all
 * already category-agnostic.
 */

import type { Project } from "@/types/project";
import type { Scene } from "@/types/scene";
import { ZipWriter } from "./zip";

export type DownloadCategory = "root" | "images" | "animation" | "voiceover";

export interface DownloadTask {
  category: DownloadCategory;
  filename: string;
  url: string;
}

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  /** Filenames currently being fetched, for a live "downloading X, Y…" line. */
  currentFiles: string[];
  stopping: boolean;
}

export interface DownloadFailure {
  filename: string;
  message: string;
}

export interface DownloadResult {
  succeeded: number;
  failed: DownloadFailure[];
  cancelled: number;
}

export type DownloadDestinationKind = "directory" | "zip";

export interface DownloadRunResult extends DownloadResult {
  destination: DownloadDestinationKind;
  /** The chosen folder's name, or the generated .zip's filename. */
  destinationName: string;
}

// Cloudinary fetches are the bottleneck, not local CPU/disk, so a handful of
// concurrent downloads finish noticeably faster than one at a time without
// risking a provider rate limit the way concurrent *generation* calls would.
const DOWNLOAD_CONCURRENCY = 4;

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop() ?? "";
    const dot = last.lastIndexOf(".");
    if (dot === -1) return fallback;
    const ext = last.slice(dot + 1).toLowerCase();
    // Cloudinary secure_urls always end in a real extension for what this app
    // uploads, but guard against something implausible slipping through
    // rather than trusting the URL blindly.
    return /^[a-z0-9]{2,4}$/.test(ext) ? ext : fallback;
  } catch {
    return fallback;
  }
}

function padSceneNumber(sceneNumber: number, totalScenes: number): string {
  const width = Math.max(2, String(totalScenes).length);
  return String(sceneNumber).padStart(width, "0");
}

/** Builds the full task list up front so the caller can show a file count
 * ("Download All · 42 files") before anything is fetched, and so an empty
 * project (nothing generated yet) can disable the button instead of opening a
 * folder picker for a run that would do nothing. */
export function buildDownloadTasks(project: Project, scenes: Scene[]): DownloadTask[] {
  const tasks: DownloadTask[] = [];

  if (project.thumbnail_image_url) {
    tasks.push({
      category: "root",
      filename: `thumbnail.${extensionFromUrl(project.thumbnail_image_url, "png")}`,
      url: project.thumbnail_image_url,
    });
  }

  const totalScenes = scenes.length;
  for (const scene of scenes) {
    const num = padSceneNumber(scene.scene_number, totalScenes);
    if (scene.generated_image_url) {
      tasks.push({
        category: "images",
        filename: `scene_${num}.${extensionFromUrl(scene.generated_image_url, "png")}`,
        url: scene.generated_image_url,
      });
    }
    if (scene.generated_animation_url) {
      tasks.push({
        category: "animation",
        filename: `scene_${num}.${extensionFromUrl(scene.generated_animation_url, "mp4")}`,
        url: scene.generated_animation_url,
      });
    }
  }

  return tasks;
}

/** Type-guards `window.showDirectoryPicker` in one place -- see
 * src/types/file-system-access.d.ts for why this needs an ambient declaration
 * at all. Returns null in SSR and in any browser lacking the API. */
function getDirectoryPicker():
  | ((options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>)
  | null {
  if (typeof window === "undefined") return null;
  return window.showDirectoryPicker ?? null;
}

export function supportsDirectoryPicker(): boolean {
  return getDirectoryPicker() !== null;
}

async function fetchAsBytes(url: string, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Runs `tasks` with up to DOWNLOAD_CONCURRENCY in flight, calling `write` to
 * persist each successfully-fetched file and `onProgress` after every
 * completion/failure. `write` is the only thing that differs between the
 * real-folder path and the zip-fallback path -- everything else here is
 * shared. A single shared AbortSignal (not one per file) both stops new
 * fetches from starting and cancels whatever's currently in flight, so Stop
 * takes effect immediately rather than only once the current batch finishes. */
async function runPool(
  tasks: DownloadTask[],
  write: (task: DownloadTask, bytes: Uint8Array<ArrayBuffer>) => Promise<void> | void,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<DownloadResult> {
  let completed = 0;
  const failed: DownloadFailure[] = [];
  const inFlight = new Set<string>();
  let index = 0;

  const report = () =>
    onProgress({
      total: tasks.length,
      completed,
      failed: failed.length,
      currentFiles: Array.from(inFlight),
      stopping: signal.aborted,
    });

  const worker = async () => {
    // The check-then-increment below never straddles an `await`, so it's
    // race-free across concurrent workers despite the shared `index`.
    while (index < tasks.length && !signal.aborted) {
      const task = tasks[index++];
      inFlight.add(task.filename);
      report();
      try {
        const bytes = await fetchAsBytes(task.url, signal);
        await write(task, bytes);
        completed += 1;
      } catch (err) {
        // An abort mid-fetch is a cancellation, not a failure -- it's counted
        // via the final `cancelled` total below instead of ending up in the
        // failure list (and the end-of-run alert) as something that broke.
        if (!signal.aborted) {
          failed.push({
            filename: task.filename,
            message: err instanceof Error ? err.message : "Failed to download.",
          });
        }
      } finally {
        inFlight.delete(task.filename);
        report();
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, tasks.length) }, worker));
  report();
  return { succeeded: completed, failed, cancelled: tasks.length - completed - failed.length };
}

async function ensureSubdirectory(
  root: FileSystemDirectoryHandle,
  name: string,
  cache: Map<string, FileSystemDirectoryHandle>
): Promise<FileSystemDirectoryHandle> {
  const cached = cache.get(name);
  if (cached) return cached;
  const handle = await root.getDirectoryHandle(name, { create: true });
  cache.set(name, handle);
  return handle;
}

async function downloadToDirectory(
  root: FileSystemDirectoryHandle,
  tasks: DownloadTask[],
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<DownloadResult> {
  const dirCache = new Map<string, FileSystemDirectoryHandle>();
  return runPool(
    tasks,
    async (task, bytes) => {
      const dir =
        task.category === "root" ? root : await ensureSubdirectory(root, task.category, dirCache);
      const fileHandle = await dir.getFileHandle(task.filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
    },
    onProgress,
    signal
  );
}

async function downloadToZip(
  tasks: DownloadTask[],
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<{ result: DownloadResult; blob: Blob }> {
  const zip = new ZipWriter();
  const result = await runPool(
    tasks,
    (task, bytes) => {
      const path = task.category === "root" ? task.filename : `${task.category}/${task.filename}`;
      zip.addFile(path, bytes);
    },
    onProgress,
    signal
  );
  return { result, blob: zip.build() };
}

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150) || "project";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a delay rather than immediately -- some browsers need the blob
  // URL to stay valid slightly past the click for the download to actually start.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The one entry point the page calls. Opens the OS folder picker when the
 * browser supports it (must be called with no prior `await` in the click
 * handler, so the picker still counts as a direct response to the user's
 * gesture); falls back to a single .zip download otherwise. Returns null if
 * the user cancelled the folder picker -- that's not an error, just nothing
 * to report. */
export async function runProjectDownload(
  tasks: DownloadTask[],
  projectName: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<DownloadRunResult | null> {
  const picker = getDirectoryPicker();

  if (picker) {
    let root: FileSystemDirectoryHandle;
    try {
      root = await picker({ mode: "readwrite" });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      throw err;
    }
    const result = await downloadToDirectory(root, tasks, onProgress, signal);
    return { ...result, destination: "directory", destinationName: root.name };
  }

  const { result, blob } = await downloadToZip(tasks, onProgress, signal);
  const filename = `${sanitizeFilename(projectName)}.zip`;
  triggerBlobDownload(blob, filename);
  return { ...result, destination: "zip", destinationName: filename };
}
