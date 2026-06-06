import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { currentUser, letters } from '../data/mock';
import Avatar from '../components/Avatar';

export default function MePage() {
  const { t, i18n } = useTranslation();
  const myDrafts: typeof letters = [];
  const myPublished = letters.filter((l) => l.authorId === currentUser.id);

  const changeLang = (lng: 'fr' | 'en') => {
    i18n.changeLanguage(lng);
    localStorage.setItem('kind:lang', lng);
  };

  return (
    <div className="me">
      <header className="me__header">
        <Avatar user={currentUser} size="lg" />
        <div>
          <div className="me__name">{currentUser.name}</div>
          <div className="me__webid">{currentUser.webId}</div>
        </div>
      </header>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.drafts')}</h2>
        {myDrafts.length === 0 ? (
          <p className="muted">{t('me.emptyDrafts')}</p>
        ) : (
          myDrafts.map((l) => (
            <Link key={l.id} to={`/write/${l.id}`} className="me__item">
              <span>{l.title}</span>
              <span className="me__item-meta">draft</span>
            </Link>
          ))
        )}
      </section>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.published')}</h2>
        {myPublished.map((l) => (
          <Link key={l.id} to={`/read/${l.id}`} className="me__item">
            <span>{l.title}</span>
            <span className="me__item-meta">
              {new Date(l.publishedAt).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB')}
            </span>
          </Link>
        ))}
      </section>

      <section className="me__section">
        <h2 className="me__section-title">{t('me.toReview')}</h2>
        <p className="muted">{t('me.emptyReview')}</p>
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
