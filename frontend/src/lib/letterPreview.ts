// Compute a human-readable label for a letter in any list view (MePage,
// UserPage, "À propos" sidebar, etc.).
//
// Why this exists: in Kind, REPLIES intentionally have no title — the
// editor strips the title field when responding, because the title of
// the parent letter already announces the subject. That's good
// editorial UX, but it leaves list views with rows whose `title` field
// is empty / undefined. Rendering `<span>{letter.title}</span>` then
// produces an invisible row: the date and the status badge show up,
// but there's no recognisable handle for the letter.
//
// previewLabel falls back to a one-line snippet of the body when no
// title is set. 80 chars by default — long enough to be self-explanatory,
// short enough to fit one line on mobile.
export function previewLabel(
  title: string | null | undefined,
  body: string | null | undefined,
  maxBodyChars = 80
): string {
  const t = (title || '').trim();
  if (t) return t;
  const b = (body || '').trim();
  if (!b) return '';
  if (b.length <= maxBodyChars) return b;
  return b.slice(0, maxBodyChars - 1) + '…';
}
