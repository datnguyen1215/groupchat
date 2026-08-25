import { listDocuments } from '$lib/server/repo';

/**
 * `depends` on the same key the layout uses: this `documents` shadows the
 * layout's in `page.data`, so without it the page — and the modal reading
 * through it — would keep serving the copy loaded at navigation while every
 * other view updated live.
 */
export const load = async ({ depends }) => {
  depends('live:threads');
  return { documents: await listDocuments() };
};
