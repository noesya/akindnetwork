import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useGetList } from 'ra-core';
import DemoBanner from '../components/DemoBanner';
import LetterEditor from '../components/LetterEditor';
import { letters as mockLetters } from '../data/mock';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { toSlug } from '../lib/letterSlug';
import { previewLabel } from '../lib/letterPreview';

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
  const { user } = useCurrentUser();
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
      {user.isMock && <DemoBanner />}
      {/* `key` forces a fresh LetterEditor on every draftId change. Without
        it the editor keeps the previous draft's title/body in local state
        and the `hydrated` guard prevents re-hydration when the user clicks
        a different draft in the list below. Remounting is the simplest
        correct reset.
        Drafts + in-review lists are passed as children so they render
        INSIDE the editor's center column (right under the text), sharing
        its width and indent. */}
      <LetterEditor key={effectiveId || 'new'} draftId={effectiveId}>
        <DraftsAndReview hasOpenDraft={Boolean(effectiveId)} />
      </LetterEditor>
    </>
  );
}

function DraftsAndReview({ hasOpenDraft }: { hasOpenDraft: boolean }) {
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated } = useCurrentUser();

  const { data } = useGetList<PodLetter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: 'dc:modified', order: 'DESC' }
    },
    { enabled: isAuthenticated }
  );

  // Pull from the Pod when authenticated, otherwise from the mock data —
  // the demo experience needs example drafts + in-review entries so
  // visitors can see what the workspace looks like before connecting a Pod.
  let drafts: PodLetter[];
  let inReview: PodLetter[];
  if (isAuthenticated) {
    const podLetters = data ?? [];
    drafts = podLetters.filter((l) => l['kind:status'] === 'draft');
    inReview = podLetters.filter((l) => l['kind:status'] === 'pending-review');
  } else {
    const mine = mockLetters.filter((l) => l.authorId === user.id);
    const toPodShape = (l: typeof mockLetters[number]): PodLetter => ({
      id: l.id,
      name: l.title,
      'kind:status': l.status === 'in-review' ? 'pending-review' : (l.status as any),
      'dc:created': l.createdAt,
      'dc:modified': l.publishedAt
    });
    drafts = mine.filter((l) => l.status === 'draft').map(toPodShape);
    inReview = mine.filter((l) => l.status === 'in-review').map(toPodShape);
  }

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
                <span>{previewLabel(l.name, l.content) || t('me.untitledDraft')}</span>
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
                <span>{previewLabel(l.name, l.content) || t('me.untitledDraft')}</span>
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
