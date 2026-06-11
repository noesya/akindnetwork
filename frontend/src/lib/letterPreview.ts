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
//
// Both arguments are treated as JSON-LD values (not just strings): when
// MePage reads letters straight from the Pod via the dataProvider, the
// `name` and `content` fields can come back as `{ @value, @language }`
// language-tagged objects rather than bare strings. Calling `.trim()`
// on that object throws and crashes the page render. `asString()`
// unwraps every shape we've seen the Pod return so callers don't have
// to know the difference.

type JsonLdValue =
  | string
  | number
  | null
  | undefined
  | { '@value'?: unknown; '@id'?: unknown; id?: unknown }
  | Array<JsonLdValue>;

function asString(v: JsonLdValue): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? asString(v[0]) : '';
  if (typeof v === 'object') {
    if (typeof v['@value'] === 'string') return v['@value'];
    if (typeof v['@id'] === 'string') return v['@id'];
    if (typeof v.id === 'string') return v.id;
  }
  return '';
}

export function previewLabel(
  title: JsonLdValue,
  body: JsonLdValue,
  maxBodyChars = 80
): string {
  const t = asString(title).trim();
  if (t) return t;
  const b = asString(body).trim();
  if (!b) return '';
  if (b.length <= maxBodyChars) return b;
  return b.slice(0, maxBodyChars - 1) + '…';
}
