import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="home">
      <div className="home__inner">
        <Logo className="home__wordmark" />
        <p className="home__tagline">{t('about.subtitle')}</p>
      </div>
    </div>
  );
}
