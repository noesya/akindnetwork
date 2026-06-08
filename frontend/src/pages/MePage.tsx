import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetList, useLogout } from 'ra-core';
import { letters } from '../data/mock';
import Avatar from '../components/Avatar';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { isAuthConfigured } from '../providers/setup';
import { toSlug } from '../lib/letterSlug';

type PodLetter = {
  id: string;
  name?: string;
  content?: string;
  'kind:status'?: 'draft' | 'pending-review' | 'published';
  'dc:created'?: string;
  'dc:modified'?: string;
};

export default function MePage() {
  const { t, i18n } = useTranslation();
  const logout = useLogout();
  const { user, isAuthenticated } = useCurrentUser();

  // Pull every Letter the user can read (server-side WebACL already filters
  // to their own + shared-in). We bucket by `kind:status` client-side rather
  // than relying on filter support, which is uneven across SemApps
  // dataProviders for non-standard predicates.
  const { data: rawLetters } = useGetList<PodLetter>(
    'Letter',
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: 'dc:modified', order: 'DESC' }
    },
    { enabled: isAuthenticated }
  );
  const podLetters: PodLetter[] = rawLetters || [];
  const myDrafts = podLetters.filter((l) => l['kind:status'] === 'draft');
  const myInReview = podLetters.filter((l) => l['kind:status'] === 'pending-review');
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
      <header className="me__header">
        <Avatar user={user} size="lg" />
        <div>
          <div className="me__name">{user.name}</div>
          <div className="me__webid">{user.webId}</div>
          {user.isMock && (
            <div className="me__mock-badge">{t('me.mockBadge')}</div>
          )}
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
        <h2 className="me__section-title">{t('me.drafts')}</h2>
        {myDrafts.length === 0 ? (
          <p className="muted">{t('me.emptyDrafts')}</p>
        ) : (
          myDrafts.map((l) => (
            <Link
              key={l.id}
              to={`/write/${toSlug(l.id)}`}
              className="me__item"
            >
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
        {myInReview.length === 0 ? (
          <p className="muted">{t('me.emptyReview')}</p>
        ) : (
          myInReview.map((l) => (
            <Link
              key={l.id}
              to={`/write/${toSlug(l.id)}`}
              className="me__item"
            >
              <span>{l.name || t('me.untitledDraft')}</span>
              <span className="me__item-meta">
                <span className="me__badge me__badge--review">{t('me.status.inReview')}</span>
                {formatDate(l['dc:modified'] || l['dc:created'], i18n.language)}
              </span>
            </Link>
          ))
        )}
      </section>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.published')}</h2>
        {myPublished.length === 0 ? (
          <p className="muted">{t('me.emptyPublished')}</p>
        ) : (
          myPublished.map((l) => {
            const title = 'title' in l ? l.title : l.name;
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
                <span>{title}</span>
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
