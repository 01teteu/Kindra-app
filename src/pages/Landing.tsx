import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Brand } from '../components/ui/Brand';
import './public.css';

export function Landing() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Kindra — Treino e nutrição em um só lugar';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="public-page kindra-landing">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <header className="public-header public-container">
        <Link to="/" aria-label="Kindra — página inicial"><Brand /></Link>
        <nav aria-label="Navegação principal" className="public-nav">
          <a href="#seu-dia" className="public-nav-detail">Conheça o Kindra</a>
          <Link to="/login" className="kindra-button button-ghost button-sm">Entrar</Link>
          <Link to="/register" className="kindra-button button-outline button-sm">Criar conta</Link>
        </nav>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section className="public-hero public-container" aria-labelledby="hero-title">
          <div className="public-hero-copy">
            <h1 id="hero-title">
              <span className="public-hero-brand">Kindra<span className="text-teal-400">.</span></span>
              <span className="public-hero-proposal">Treino e nutrição<br />em um só lugar.</span>
            </h1>
            <p className="public-lead">Registre seus treinos, refeições e água. Acompanhe seu peso e o histórico da sua rotina.</p>
            <div className="public-actions">
              <Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a href="#seu-dia" className="kindra-button button-ghost">Conhecer o Kindra <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
          </div>

          <aside className="public-product" aria-labelledby="product-title" aria-describedby="product-caption">
            <div className="public-product-heading">
              <h2 id="product-title">Seus registros</h2>
              <p id="product-caption">Visão conceitual do produto</p>
            </div>
            <div className="public-product-training">
              <h3>Treino</h3>
              <p className="public-product-context">Rotina de exercícios</p>
              <dl className="public-training-fields">
                <div><dt>Exercício</dt><dd>Movimento</dd></div>
                <div><dt>Séries</dt><dd>Repetições · Carga</dd></div>
              </dl>
            </div>
            <div className="public-product-nutrition">
              <h3>Nutrição</h3>
              <p className="public-product-context">Registro de refeições</p>
              <p className="public-product-detail">Calorias · Proteínas<br />Carboidratos · Gorduras</p>
            </div>
            <dl className="public-product-tracking">
              <div><dt>Hidratação</dt><dd>Consumo de água</dd></div>
              <div><dt>Evolução</dt><dd>Peso e histórico</dd></div>
            </dl>
          </aside>
        </section>

        <section id="seu-dia" className="public-benefits public-container" aria-labelledby="benefits-title">
          <div className="public-section-heading">
            <h2 id="benefits-title">Do registro ao acompanhamento.</h2>
            <p>Registros pessoais para acompanhar o treino, a alimentação e a evolução física.</p>
          </div>
          <div className="public-pillar-grid">
            <article className="public-pillar">
              <h3>Treino</h3>
              <p>Explore exercícios, organize rotinas e registre a execução dos seus treinos.</p>
            </article>
            <article className="public-pillar">
              <h3>Nutrição e hidratação</h3>
              <p>Registre refeições e água. Acompanhe nutrientes e consumo em relação às suas metas.</p>
            </article>
            <article className="public-pillar">
              <h3>Evolução</h3>
              <p>Acompanhe seu peso e consulte o histórico de metas de nutrição e hidratação.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="public-footer public-container">
        <Link to="/" aria-label="Kindra — página inicial"><Brand /></Link>
        <nav aria-label="Links do rodapé" className="public-footer-links">
          <Link to="/register">Criar conta</Link>
          <Link to="/login">Já tenho conta</Link>
          <a href="#conteudo">Voltar ao início ↑</a>
        </nav>
      </footer>
    </div>
  );
}
