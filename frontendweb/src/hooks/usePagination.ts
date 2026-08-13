"use client";

import { useMemo, useState } from "react";

/** Client-side pagination over an already-fetched array. Every list this backs
 *  (characters, style templates, liked projects, generated scripts, profile
 *  history) comes from a single GET that already returns the whole list — none
 *  of these endpoints take page/limit params — so slicing here avoids a second
 *  round trip per page turn.
 *
 *  `page` is clamped against the *current* `pageCount` on every render rather
 *  than stored pre-clamped, so a page position that's still valid survives a
 *  list shrinking (e.g. a delete) and only snaps back when it would otherwise
 *  point past the end. */
export function usePagination<T>(items: T[], pageSize: number) {
  const [rawPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(rawPage, pageCount);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  return { page, setPage, pageCount, pageItems, totalItems: items.length };
}
