import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Sticky-feeling strip that tells anonymous visitors they're looking at the
 * demo data, not their own Pod. Rendered by ReadPage / LetterPage / WritePage
 * when `useCurrentUser().user.isMock === true`. /me has its own dedicated
 * badge (more contextual on the profile page) so it doesn't render this.
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
