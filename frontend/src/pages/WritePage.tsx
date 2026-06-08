import { useEffect } from 'react';
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
 * /write — single page with the editor at the top and (on desktop) the
 * user's drafts + in-review letters in two columns below.
 *
 * Routes:
 *   /write          → blank editor + lists
 *   /write/:slug    → editor pre-loaded with that draft + same lists
 *
 * On `draftId` change we scroll to the top of the page — without this,
 * clicking a draft in the bottom list would mount the freshly-loaded
 * editor above the fold but leave the user looking at where the list was.
 */
export default function WritePage() {
  const { draftId } = useParams();
  // Historical: /write/new used to mean "blank editor" when the workspace was
  // a separate page. We keep the alias working so bookmarked URLs don't break.
  const effectiveId = draftId === 'new' ? undefined : draftId;

  useEffect(() => {
    // Smooth so the transition reads as intentional rather than a glitch.
    // Falls back to instant jump on browsers without scrollTo options.
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [draftId]);

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
  if (drafts.length === 0 && inReview.length === 0 && !hasOpenDraft) return null;

  return (
    <div className="write-lists">
      {hasOpenDraft && (
        <Link to="/write" className="btn write-lists__cta">
          {t('write.newLetter')}
        </Link>
      )}

      <div className="write-lists__columns">
        <section className="write-lists__col">
          <h2 className="write-lists__title">{t('me.drafts')}</h2>
          {drafts.length === 0 ? (
            <p className="muted">{t('me.emptyDrafts')}</p>
          ) : (
            drafts.map((l) => (
              <Link key={l.id} to={`/write/${toSlug(l.id)}`} className="me__item">
                <span>{l.name || t('me.untitledDraft')}</span>
                <span className="me__item-meta">
                  <span className="me__badge me__badge--draft">{t('me.status.draft')}</span>
                  {formatDate(l['dc:modified'] || l['dc:created'], i18n.language)}
                </span>
              </Link>
            ))
          )}
        </section>

        <section className="write-lists__col">
          <h2 className="write-lists__title">{t('me.inReview')}</h2>
          {inReview.length === 0 ? (
            <p className="muted">{t('me.emptyReview')}</p>
          ) : (
            inReview.map((l) => (
              <Link key={l.id} to={`/write/${toSlug(l.id)}`} className="me__item">
                <span>{l.name || t('me.untitledDraft')}</span>
                <span className="me__item-meta">
                  <span className="me__badge me__badge--review">{t('me.status.inReview')}</span>
                  {formatDate(l['dc:modified'] || l['dc:created'], i18n.language)}
                </span>
              </Link>
            ))
          )}
        </section>
      </div>
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
