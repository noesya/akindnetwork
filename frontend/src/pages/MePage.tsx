import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetList, useLogout } from 'ra-core';
import { letters } from '../data/mock';
import Avatar from '../components/Avatar';
import DemoBanner from '../components/DemoBanner';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { isAuthConfigured } from '../providers/setup';
import { toSlug } from '../lib/letterSlug';
import { previewLabel } from '../lib/letterPreview';

type PodLetter = {
  id: string;
  name?: string;
  content?: string;
  'kind:status'?: 'draft' | 'pending-review' | 'published';
  'dc:created'?: string;
  'dc:modified'?: string;
};

/**
 * /me — profile page. Identity + account + language + my published letters.
 *
 * Drafts and in-review letters used to live here too; they moved to /write
 * (the writing workspace) so the page reflects only what's PUBLIC about the
 * user. Everything still-being-worked-on belongs to writing.
 */
export default function MePage() {
  const { t, i18n } = useTranslation();
  const logout = useLogout();
  const { user, isAuthenticated } = useCurrentUser();

  const { data: rawLetters } = useGetList<PodLetter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: 'dc:modified', order: 'DESC' }
    },
    { enabled: isAuthenticated }
  );
  const podLetters: PodLetter[] = rawLetters || [];
  const myPodPublished = podLetters.filter((l) => l['kind:status'] === 'published');
  // Fall back to mock published letters when no Pod is connected (demo mode).
  const myPublished = isAuthenticated
    ? myPodPublished
    : letters.filter((l) => l.authorId === user.id);

  const changeLang = (lng: 'fr' | 'en') => {
    i18n.changeLanguage(lng);
    localStorage.setItem('kind:lang', lng);
  };

  return (
    <div className="me">
      {/* Unified mock-mode signal: same <DemoBanner/> as /read, /write, /letter,
        /u. /me used to render its own inline pill (`me__mock-badge`) — removed
        for consistency. The banner sits above the profile card with a "Connect
        my Pod" CTA, which beats the previous tiny grey pill at communicating
        that they're in demo mode AND giving them the action to leave it. */}
      {user.isMock && <DemoBanner />}

      <header className="me__header">
        <Avatar user={user} size="lg" />
        <div>
          <div className="me__name">{user.name}</div>
          <div className="me__webid">{user.webId}</div>
        </div>
      </header>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.account')}</h2>
        {isAuthenticated ? (
          <button className="btn btn--ghost" onClick={() => logout()}>
            {t('me.logout')}
          </button>
        ) : (
          <Link to="/login" className="btn">
            {isAuthConfigured ? t('me.connectPod') : t('me.connectPodDisabled')}
          </Link>
        )}
      </section>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.published')}</h2>
        {myPublished.length === 0 ? (
          <p className="muted">{t('me.emptyPublished')}</p>
        ) : (
          myPublished.map((l) => {
            // Replies have no title — fall back to a body snippet so the row
            // is recognisable in the list rather than rendering as a blank
            // line with just a date and a badge.
            const rawTitle = 'title' in l ? l.title : l.name;
            const rawBody =
              'paragraphs' in l ? l.paragraphs.join(' ') : l.content;
            const label =
              previewLabel(rawTitle, rawBody) || t('me.untitledDraft');
            const dateStr =
              'publishedAt' in l
                ? new Date(l.publishedAt).toLocaleDateString(
                    i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
                  )
                : formatDate(l['dc:modified'] || l['dc:created'], i18n.language);
            return (
              <Link
                key={l.id}
                to={`/read/${toSlug(l.id)}`}
                className="me__item"
              >
                <span>{label}</span>
                <span className="me__item-meta">
                  <span className="me__badge me__badge--published">{t('me.status.published')}</span>
                  {dateStr}
                </span>
              </Link>
            );
          })
        )}
      </section>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.languageLabel')}</h2>
        <div className="me__lang-toggle">
          <button
            className={`me__lang-btn${i18n.language === 'fr' ? ' me__lang-btn--active' : ''}`}
            onClick={() => changeLang('fr')}
          >
            Français
          </button>
          <button
            className={`me__lang-btn${i18n.language === 'en' ? ' me__lang-btn--active' : ''}`}
            onClick={() => changeLang('en')}
          >
            English
          </button>
        </div>
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
