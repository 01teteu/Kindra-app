import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Utensils, Dumbbell, Settings } from 'lucide-react';
import { useEffect } from 'react';
import { Brand } from '../ui/Brand';

const destinations = [
  { to: '/home', label: 'Início', icon: Home },
  { to: '/nutri', label: 'Nutrição', icon: Utensils },
  { to: '/workout', label: 'Treinos', icon: Dumbbell },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className="app-brand">
        <Brand />
        <span className="eyebrow">Sua rotina, em movimento</span>
      </header>
      <main id="main-content" className="app-content" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="app-navigation" aria-label="Navegação principal">
        <div className="desktop-brand">
          <Brand />
        </div>
        <div className="nav-items grid-cols-4">
          {destinations.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
            >
              <span className="nav-icon">
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
        <p className="nav-caption">
          Um dia de cada vez.
          <br />
          <span>Esse é o seu ritmo.</span>
        </p>
      </nav>
    </div>
  );
}
