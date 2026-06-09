// Thin HTTP client for the Kind backend's `kind-peer-review` service.
//
// We talk to the backend directly (not through SemApps' dataProvider) for
// peer-review actions because they're verb-y rather than CRUD-y — the
// dataProvider only knows how to GET/POST/PATCH/DELETE resources. The
// backend route is registered in peer-review.service.js#started().
//
// Auth: same Bearer token SemApps' dataProvider uses (issued by the Pod
// Provider on OIDC login). The backend's API gateway delegates to
// `auth.authenticate` which validates the JWT and populates ctx.meta.webId.

const BACKEND_URL =
  import.meta.env.VITE_KIND_BACKEND_URL ?? 'https://api.akindnetwork.org';

async function call<T>(path: string, body: unknown): Promise<T> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    // Moleculer-web error bodies are { name, message, code, type, data }
    let detail: any = null;
    try {
      detail = await r.json();
    } catch {
      /* not JSON — fall back to status text below */
    }
    const message = detail?.message || `HTTP ${r.status} ${r.statusText}`;
    throw new Error(message);
  }
  return r.json();
}

export type SubmitDraftResult = {
  reviewers: string[]; // WebIDs of the assigned reviewers
};

export type VoteResult = {
  // Final status of the letter AFTER this vote was applied. "pending-review"
  // means more votes are still needed; "published" / "draft" mean the
  // aggregation threshold was reached this round.
  status: 'pending-review' | 'published' | 'draft' | 'rejected';
  approvedCount: number;
  rejectedCount: number;
  threshold: number;
};

export function submitDraftForReview(letterUri: string): Promise<SubmitDraftResult> {
  return call<SubmitDraftResult>('/kind/peer-review/submit-draft', { letterUri });
}

export function approveLetter(letterUri: string): Promise<VoteResult> {
  return call<VoteResult>('/kind/peer-review/approve', { letterUri });
}

export function rejectLetter(letterUri: string, comment: string): Promise<VoteResult> {
  return call<VoteResult>('/kind/peer-review/reject', { letterUri, comment });
}
