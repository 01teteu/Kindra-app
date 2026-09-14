import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Brand } from '../components/ui/Brand';
import './public.css';

export function NotFound() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Página não encontrada — Kindra';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="public-page public-not-found">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <header className="public-header public-container">
        <Link to="/" aria-label="Kindra — página inicial"><Brand /></Link>
        <span className="eyebrow">Seu ritmo. Sua evolução.</span>
      </header>
      <main id="conteudo" tabIndex={-1} className="public-error public-container">
        <div className="public-error-code" aria-hidden="true">404<span className="text-teal-400">.</span></div>
        <div className="public-error-copy">
          <p className="eyebrow">Erro 404 / Rota não encontrada</p>
          <h1>Este caminho<br />não existe.</h1>
          <p>A página que você procura não foi encontrada. Volte ao início ou continue sua rotina na aplicação.</p>
          <div className="public-actions">
            <Link to="/" className="kindra-button button-primary"><ArrowLeft size={17} aria-hidden="true" />Voltar ao início</Link>
            <Link to="/home" className="kindra-button button-outline">Ir para a aplicação <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
        </div>
      </main>
      <footer className="public-footer public-container"><p>Kindra / Nutrição e treino no seu ritmo.</p></footer>
    </div>
  );
}
