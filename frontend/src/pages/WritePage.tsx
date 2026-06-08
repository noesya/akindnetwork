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
 * /write is now a small workspace page rather than the editor itself.
 *
 * Routes:
 *   /write            → this workspace (drafts list + in-review list + "+ New")
 *   /write/new        → empty LetterEditor for composing a new letter
 *   /write/:draftId   → LetterEditor loaded with an existing draft
 *
 * Sitting drafts + in-review under /write (not /me) matches the mental model
 * "writing is one continuous workspace": save a draft, come back to it,
 * watch it move into review, all without changing pages.
 */
export default function WritePage() {
  const { draftId } = useParams();
  // Two sub-modes: editor (/write/new or /write/:draftId) or workspace (/write).
  // We treat the literal slug "new" as "no draft yet" so the editor starts
  // blank rather than trying to fetch a record named `new`.
  if (draftId === 'new') return <LetterEditor />;
  if (draftId) return <LetterEditor draftId={draftId} />;
  return <Workspace />;
}

function Workspace() {
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

  return (
    <div className="me">
      <header className="me__header">
        <div>
          <div className="me__name">{t('write.workspaceTitle')}</div>
          <div className="me__webid">{t('write.workspaceHint')}</div>
        </div>
        <Link to="/write/new" className="btn" style={{ marginLeft: 'auto' }}>
          {t('write.newLetter')}
        </Link>
      </header>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.drafts')}</h2>
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

      <section className="me__section">
        <h2 className="me__section-title">{t('me.inReview')}</h2>
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
