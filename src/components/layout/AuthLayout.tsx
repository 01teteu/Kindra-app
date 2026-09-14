import type { ReactNode } from 'react';
import { Brand } from '../ui/Brand';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <header className="auth-brand">
        <Brand />
        <span className="eyebrow">Seu ritmo. Sua evolução.</span>
      </header>
      <aside className="auth-story" aria-hidden="true">
        <span className="eyebrow">Nutrição · Movimento · Constância</span>
        <h2>
          O próximo passo
          <br />é <span className="silver-text">seu.</span>
        </h2>
        <p>
          Um espaço para cuidar da sua rotina.
          <br />
          Um dia de cada vez.
        </p>
        <div className="auth-track">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <span className="eyebrow">KINDRA / TODOS OS DIAS</span>
      </aside>
      <main className="auth-content">{children}</main>
      <footer className="auth-footer">Nutrição e treino no seu ritmo.</footer>
    </div>
  );
}
