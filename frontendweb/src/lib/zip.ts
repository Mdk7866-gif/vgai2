/**
 * A minimal, dependency-free ZIP writer -- STORE method only (no compression).
 *
 * Exists so `downloadProject.ts` has a fallback for browsers without the File
 * System Access API (Firefox, Safari): instead of choosing a real folder,
 * those users get one `.zip` download whose internal folder structure
 * (`images/`, `animation/`, a root-level thumbnail) matches exactly what the
 * File System Access path writes to disk directly. No compression because the
 * source files are already-compressed images/video -- deflating them again
 * would spend CPU for near-zero size savings, and STORE keeps this file under
 * ~150 lines instead of needing a real deflate implementation.
 *
 * Format reference: the .ZIP File Format Specification (PKWARE APPNOTE.TXT).
 */

interface ZipEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
  crc: number;
  dosDate: number;
  dosTime: number;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(data: Uint8Array<ArrayBuffer>): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(d: Date): { date: number; time: number } {
  // DOS date/time only has a 1980 floor and 2-second time resolution -- fine
  // for a one-off export, not meant to be a precise timestamp.
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

export class ZipWriter {
  private entries: ZipEntry[] = [];

  addFile(path: string, data: Uint8Array<ArrayBuffer>, when: Date = new Date()): void {
    const { date, time } = toDosDateTime(when);
    // Zip readers expect forward slashes regardless of platform.
    this.entries.push({ name: path.replace(/\\/g, "/"), data, crc: crc32(data), dosDate: date, dosTime: time });
  }

  get fileCount(): number {
    return this.entries.length;
  }

  build(): Blob {
    const parts: BlobPart[] = [];
    const centralParts: BlobPart[] = [];
    let offset = 0;

    for (const entry of this.entries) {
      const nameBytes = new TextEncoder().encode(entry.name);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); // local file header signature
      local.setUint16(4, 20, true); // version needed to extract
      local.setUint16(6, 0, true); // general purpose bit flag
      local.setUint16(8, 0, true); // compression method: 0 = stored
      local.setUint16(10, entry.dosTime, true);
      local.setUint16(12, entry.dosDate, true);
      local.setUint32(14, entry.crc, true);
      local.setUint32(18, entry.data.length, true); // compressed size == uncompressed (stored)
      local.setUint32(22, entry.data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true); // extra field length

      parts.push(local.buffer, nameBytes, entry.data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true); // central directory file header signature
      central.setUint16(4, 20, true); // version made by
      central.setUint16(6, 20, true); // version needed to extract
      central.setUint16(8, 0, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, entry.dosTime, true);
      central.setUint16(14, entry.dosDate, true);
      central.setUint32(16, entry.crc, true);
      central.setUint32(20, entry.data.length, true);
      central.setUint32(24, entry.data.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint16(30, 0, true); // extra field length
      central.setUint16(32, 0, true); // file comment length
      central.setUint16(34, 0, true); // disk number start
      central.setUint16(36, 0, true); // internal file attributes
      central.setUint32(38, 0, true); // external file attributes
      central.setUint32(42, offset, true); // relative offset of local header

      centralParts.push(central.buffer, nameBytes);

      offset += 30 + nameBytes.length + entry.data.length;
    }

    const centralSize = centralParts.reduce(
      (sum, part) => sum + (part instanceof ArrayBuffer ? part.byteLength : (part as Uint8Array).length),
      0
    );
    const centralOffset = offset;

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); // end of central directory signature
    eocd.setUint16(4, 0, true); // disk number
    eocd.setUint16(6, 0, true); // disk with central directory
    eocd.setUint16(8, this.entries.length, true); // entries on this disk
    eocd.setUint16(10, this.entries.length, true); // total entries
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralOffset, true);
    eocd.setUint16(20, 0, true); // comment length

    return new Blob([...parts, ...centralParts, eocd.buffer], { type: "application/zip" });
  }
}
