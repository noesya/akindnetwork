import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function Layout() {
  const { t } = useTranslation();
  const { isAuthenticated } = useCurrentUser();

  return (
    <div className="layout">
      {isAuthenticated && (
        <>
          <NavLink to="/read" className="layout__corner layout__corner--tl">
            {t('nav.read')}
          </NavLink>
          <NavLink to="/write" className="layout__corner layout__corner--tr">
            {t('nav.write')}
          </NavLink>
        </>
      )}
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
