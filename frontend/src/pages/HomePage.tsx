import { useTranslation } from 'react-i18next';

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="home">
      <div className="home__inner">
        <h1 className="home__wordmark">{t('about.title')}</h1>
        <p className="home__tagline">{t('about.subtitle')}</p>
      </div>
    </div>
  );
}
