import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Dumbbell, Droplet, Flame, Utensils } from 'lucide-react';
import { Brand } from '../components/ui/Brand';
import './public.css';

const heroPhoto = new URL('../assets/landing/kindra-training.png', import.meta.url).href;

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
        <section className="landing-hero public-container" aria-labelledby="hero-title">
          <div className="landing-hero-photo" aria-hidden="true"><img src={heroPhoto} alt="" width="1672" height="941" fetchPriority="high" /></div>
          <div className="landing-intro">
            <p className="landing-context">Treino e nutrição em um só lugar</p>
            <h1 id="hero-title">Uma versão<br />mais forte<br /><span>de você.</span></h1>
            <p className="landing-lead">Organize seus treinos, registre alimentação e água e acompanhe sua evolução.</p>
            <div className="landing-actions">
              <Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a href="#seu-dia" className="landing-explore">Conhecer o Kindra <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
          </div>

          <figure className="landing-product" aria-labelledby="product-caption">
            <div className="landing-app-preview">
              <div className="landing-preview-header"><Brand /><span>Início</span></div>
              <div className="landing-preview-greeting"><span>Seu espaço</span><h2>Seu dia, no Kindra.</h2></div>
              <div className="landing-preview-streak">
                <p>Consistência nutricional</p><h3>Sua<br />ofensiva.</h3>
                <Flame className="landing-preview-flame" size={112} strokeWidth={1.1} aria-hidden="true" />
                <p className="landing-preview-note">Acompanhe sua constância em alimentação e água.</p>
              </div>
              <div className="landing-preview-today"><Dumbbell size={19} aria-hidden="true" /><div><h3>Treino de hoje</h3><p>Organize sua semana de treinos.</p></div></div>
              <div className="landing-preview-care">
                <div><Utensils size={17} aria-hidden="true" /><h3>Alimentação</h3><p>Suas refeições do dia</p></div>
                <div><Droplet size={18} aria-hidden="true" /><h3>Hidratação</h3><p>Seus registros de água</p></div>
              </div>
              <div className="landing-preview-nav" aria-hidden="true"><span>Início</span><span>Treino</span><span>Nutrição</span></div>
            </div>
            <div className="landing-preview-companion"><span>Acompanhe</span><strong>Sua evolução<ArrowUpRight size={22} aria-hidden="true" /></strong><p>Da primeira série<br />às suas melhores marcas.</p></div>
            <figcaption id="product-caption">Prévia da interface · sem dados pessoais</figcaption>
          </figure>
          <div className="landing-hero-foot"><span>Planejar. Registrar. Acompanhar.</span><a href="#seu-dia" aria-label="Explore o que você pode fazer no Kindra"><ArrowDown size={18} aria-hidden="true" /></a></div>
        </section>

        <section id="seu-dia" className="landing-daily public-container" aria-labelledby="daily-title">
          <div className="landing-section-heading"><p className="landing-context">Uma rotina, conectada.</p><h2 id="daily-title">Organize o dia.<br /><span>Registre o que fez.</span></h2><p>Menos registros espalhados. Mais clareza sobre seu treino, sua alimentação e sua água.</p></div>
          <div className="landing-daily-grid">
            <article className="landing-training-feature">
              <div className="landing-feature-title"><Dumbbell size={22} aria-hidden="true" /><h3>Um lugar para cada treino.</h3></div>
              <p>Monte suas rotinas e distribua os treinos pela semana. Durante a sessão, registre carga, repetições e séries concluídas.</p>
              <div className="landing-training-type" aria-hidden="true"><span>Minha</span><strong>semana<span>.</span></strong></div>
              <p className="landing-feature-foot">Planejamento e execução, no mesmo lugar.</p>
            </article>
            <div className="landing-care-features">
              <article><Utensils size={22} aria-hidden="true" /><h3>Alimentação<br />com contexto.</h3><p>Reúna suas refeições e acompanhe calorias e nutrientes em relação às suas metas.</p></article>
              <article><Droplet size={23} aria-hidden="true" /><h3>Água também<br />faz parte.</h3><p>Registre a água ao longo do dia e consulte o que já foi registrado.</p></article>
            </div>
          </div>
        </section>

        <section className="landing-evolution public-container" aria-labelledby="evolution-title">
          <div className="landing-evolution-title"><p className="landing-context">Seus registros têm continuidade.</p><h2 id="evolution-title">Cada<br />treino<br /><span>conta.</span></h2></div>
          <div className="landing-evolution-copy"><h3>Veja o caminho<br />que você está construindo.</h3><p>Consulte sua progressão por exercício, a carga movimentada e suas melhores marcas a partir dos treinos registrados.</p>
            <dl><div><dt>Sua força, sessão a sessão</dt><dd>Acompanhe a estimativa de força por exercício ao longo do tempo.</dd></div><div><dt>Suas melhores marcas</dt><dd>Consulte maior carga e melhor estimativa de força, no período e no histórico.</dd></div><div><dt>Consistência além do treino</dt><dd>A ofensiva nutricional acompanha os dias consolidados conforme suas metas de alimentação e água.</dd></div></dl>
          </div>
        </section>

        <section className="landing-start public-container" aria-labelledby="start-title"><div><p className="landing-context">Seu próximo passo</p><h2 id="start-title">Comece pela<br />sua rotina<span>.</span></h2></div><div><Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link><p>Já usa o Kindra? <Link to="/login">Entrar</Link></p></div></section>
      </main>
      <footer className="public-footer public-container"><Link to="/" aria-label="Kindra — página inicial"><Brand /></Link><nav aria-label="Links do rodapé" className="landing-footer-links"><Link to="/register">Criar conta</Link><Link to="/login">Já tenho conta</Link><a href="#conteudo">Voltar ao início ↑</a></nav></footer>
    </div>
  );
}
