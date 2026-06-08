import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useGetList } from 'ra-core';
import LetterEditor from '../components/LetterEditor';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { toSlug } from '../lib/letterSlug';

type PodLetter = {
  id: string;
  name?: string;
  'kind:status'?: 'draft' | 'pending-review' | 'published' | 'rejected';
  'dc:created'?: string;
  'dc:modified'?: string;
};

/**
 * /write — a single page with the editor at the top and the user's drafts +
 * in-review letters listed below.
 *
 * Routes:
 *   /write          → blank editor + lists
 *   /write/:slug    → editor pre-loaded with that draft + same lists
 *
 * "+ Nouvelle lettre" (rendered above the lists when a draft is loaded)
 * resets the editor by navigating back to /write.
 */
export default function WritePage() {
  const { draftId } = useParams();
  // Historical: /write/new used to mean "blank editor" when the workspace was
  // a separate page. We keep the alias working so bookmarked URLs don't break.
  const effectiveId = draftId === 'new' ? undefined : draftId;
  return (
    <>
      <LetterEditor draftId={effectiveId} />
      <DraftsAndReview hasOpenDraft={Boolean(effectiveId)} />
    </>
  );
}

function DraftsAndReview({ hasOpenDraft }: { hasOpenDraft: boolean }) {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useCurrentUser();

  const { data } = useGetList<PodLetter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: 'dc:modified', order: 'DESC' }
    },
    { enabled: isAuthenticated }
  );
  const podLetters = data ?? [];
  const drafts = podLetters.filter((l) => l['kind:status'] === 'draft');
  const inReview = podLetters.filter((l) => l['kind:status'] === 'pending-review');

  if (!isAuthenticated) return null;
  // Nothing to show in the lists for a fresh user with no drafts. Surface a
  // "+ Nouvelle lettre" link only when we're editing something — the implicit
  // affordance of clearing the editor.
  if (drafts.length === 0 && inReview.length === 0 && !hasOpenDraft) return null;

  return (
    <div className="me" style={{ marginTop: 'var(--space-9)' }}>
      {hasOpenDraft && (
        <Link to="/write" className="btn" style={{ marginBottom: 'var(--space-6)' }}>
          {t('write.newLetter')}
        </Link>
      )}

      {drafts.length > 0 && (
        <section className="me__section">
          <h2 className="me__section-title">{t('me.drafts')}</h2>
          {drafts.map((l) => (
            <Link key={l.id} to={`/write/${toSlug(l.id)}`} className="me__item">
              <span>{l.name || t('me.untitledDraft')}</span>
              <span className="me__item-meta">
                <span className="me__badge me__badge--draft">{t('me.status.draft')}</span>
                {formatDate(l['dc:modified'] || l['dc:created'], i18n.language)}
              </span>
            </Link>
          ))}
        </section>
      )}

      {inReview.length > 0 && (
        <section className="me__section">
          <h2 className="me__section-title">{t('me.inReview')}</h2>
          {inReview.map((l) => (
            <Link key={l.id} to={`/write/${toSlug(l.id)}`} className="me__item">
              <span>{l.name || t('me.untitledDraft')}</span>
              <span className="me__item-meta">
                <span className="me__badge me__badge--review">{t('me.status.inReview')}</span>
                {formatDate(l['dc:modified'] || l['dc:created'], i18n.language)}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

function formatDate(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
