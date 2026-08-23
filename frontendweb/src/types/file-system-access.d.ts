export {};

declare global {
  // TypeScript's bundled lib.dom.d.ts already declares FileSystemDirectoryHandle
  // / FileSystemFileHandle / FileSystemWritableFileStream (and their
  // getFileHandle/getDirectoryHandle/createWritable/write members) -- it just
  // doesn't declare the entry point that hands one out. `showDirectoryPicker`
  // isn't in lib.dom yet, and this repo doesn't pull in
  // @types/wicg-file-system-access for one call site (lib/downloadProject.ts).
  interface Window {
    showDirectoryPicker?(options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: FileSystemHandle | string;
    }): Promise<FileSystemDirectoryHandle>;
  }
}
