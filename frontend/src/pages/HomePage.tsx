import { useTranslation } from 'react-i18next';

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="home">
      <div className="home__inner">
        <img
          src="/images/logo-black.svg"
          alt={t('about.title')}
          className="home__wordmark"
        />
        <p className="home__tagline">{t('about.subtitle')}</p>
      </div>
    </div>
  );
}
