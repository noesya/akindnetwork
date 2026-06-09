import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * All four corner links are always visible — Read and Write used to be
 * hidden for anonymous visitors but now point at the demo data with a
 * "Données d'exemple" banner, so there's no reason to hide them. The
 * banner is what tells visitors they're in demo mode; once they connect a
 * Pod the banner disappears and the same routes serve their real data.
 */
export default function Layout() {
  const { t } = useTranslation();

  return (
    <div className="layout">
      <NavLink to="/read" className="layout__corner layout__corner--tl">
        {t('nav.read')}
      </NavLink>
      <NavLink to="/write" className="layout__corner layout__corner--tr">
        {t('nav.write')}
      </NavLink>
      <main className="layout__main">
        <Outlet />
      </main>
      <NavLink to="/about" className="layout__corner layout__corner--bl">
        {t('nav.about')}
      </NavLink>
      <NavLink to="/me" className="layout__corner layout__corner--br">
        {t('nav.me')}
      </NavLink>
    </div>
  );
}
