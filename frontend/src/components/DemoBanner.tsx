import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Strip that tells anonymous visitors they're looking at the demo data, not
 * their own Pod. Rendered consistently on every page exposed to anonymous
 * users (ReadPage / LetterPage / WritePage / UserPage / MePage) whenever
 * `useCurrentUser().user.isMock === true`.
 *
 * Click target on the right takes them to /login so they can connect their
 * Pod and switch to real data without hunting through the corner nav.
 */
export default function DemoBanner() {
  const { t } = useTranslation();
  return (
    <div className="demo-banner">
      <span className="demo-banner__text">{t('demo.banner')}</span>
      <Link to="/login" className="demo-banner__cta">
        {t('demo.connect')} →
      </Link>
    </div>
  );
}
