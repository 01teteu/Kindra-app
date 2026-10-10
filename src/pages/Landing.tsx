import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Brand } from '../components/ui/Brand';
import './public.css';

const guardianMain = new URL('../assets/brand/totem/guardian-main.webp', import.meta.url).href;
const guardianFocused = new URL('../assets/brand/totem/guardian-focused.webp', import.meta.url).href;
const guardianSad = new URL('../assets/brand/totem/guardian-sad.webp', import.meta.url).href;
const guardianCelebrating = new URL('../assets/brand/totem/guardian-celebrating.webp', import.meta.url).href;
const productHome = new URL('../assets/landing/product-home.png', import.meta.url).href;
const productNutrition = new URL('../assets/landing/product-nutrition.png', import.meta.url).href;
const productWorkouts = new URL('../assets/landing/product-workouts.png', import.meta.url).href;

const pillars = [
  { number: '01', name: 'Treino', description: 'Planeje a semana. Registre séries, cargas e repetições quando for a hora de treinar.' },
  { number: '02', name: 'Nutrição', description: 'Reúna refeições, água e metas em um lugar que acompanha o seu dia.' },
  { number: '03', name: 'Evolução', description: 'Volte aos seus registros para entender o caminho que está construindo.' },
];

export function Landing() {
  const reduceMotion = useReducedMotion();

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
          <a href="#sistema" className="landing-nav-detail">O Kindra</a>
          <Link to="/login" className="kindra-button button-ghost button-sm">Entrar</Link>
          <Link to="/register" className="kindra-button button-outline button-sm">Criar conta</Link>
        </nav>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section className="landing-hero public-container" aria-labelledby="hero-title">
          <div className="landing-hero-stage">
            <motion.p className="landing-hero-kicker" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
              TREINO · NUTRIÇÃO · EVOLUÇÃO
            </motion.p>
            <motion.h1 id="hero-title" initial={reduceMotion ? false : { clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.14 }}>
              Continue<span>.</span>
            </motion.h1>
            <motion.div className="landing-hero-guardian" initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, delay: 0.28, ease: 'easeOut' }}>
              <img src={guardianMain} width="525" height="718" fetchPriority="high" alt="Guardian Totem do Kindra, guardião de corpo graphite e olhos mint" />
            </motion.div>
            <span className="landing-hero-index" aria-hidden="true">K / 01</span>
          </div>
          <div className="landing-hero-bottom">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.55 }}>
              <p className="landing-hero-statement">Um dia de cada vez.<br /><strong>Um caminho inteiro pela frente.</strong></p>
              <p className="landing-hero-description">O Kindra reúne seus treinos, sua alimentação e sua evolução para você seguir com clareza.</p>
            </motion.div>
            <div className="landing-hero-actions">
              <Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link to="/login" className="landing-text-link">Já tenho conta <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
          <a href="#disciplina" className="landing-scroll-cue">Descubra o Kindra <ArrowDown size={17} aria-hidden="true" /></a>
        </section>

        <section id="disciplina" className="landing-discipline" aria-labelledby="discipline-title">
          <div className="public-container landing-discipline-inner">
            <div className="landing-section-label"><span>01 / A IDEIA</span><span>DISCIPLINA</span></div>
            <motion.div className="landing-discipline-copy" initial={reduceMotion ? false : { opacity: 0, x: -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.7 }}>
              <p>Motivação passa.</p>
              <h2 id="discipline-title">Disciplina<br /><em>permanece<span>.</span></em></h2>
              <span>Não é sobre fazer tudo. É sobre continuar fazendo o que importa.</span>
            </motion.div>
            <img className="landing-discipline-guardian" src={guardianFocused} width="264" height="329" loading="lazy" alt="Guardian Totem em postura focada" />
          </div>
        </section>

        <section id="sistema" className="landing-system public-container" aria-labelledby="system-title">
          <div className="landing-section-label"><span>02 / O SISTEMA</span><span>FEITO PARA O SEU DIA</span></div>
          <div className="landing-system-intro">
            <h2 id="system-title">Tudo se<br /><span>conecta.</span></h2>
            <p>Planeje, registre e acompanhe. Cada parte da sua rotina encontra seu lugar.</p>
          </div>
          <div className="landing-pillar-list">
            {pillars.map((pillar) => (
              <article className="landing-pillar" key={pillar.number}>
                <span className="landing-pillar-number">{pillar.number}</span>
                <h3>{pillar.name}</h3>
                <p>{pillar.description}</p>
                <ArrowUpRight size={22} aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="landing-product public-container" aria-labelledby="product-title">
          <div className="landing-section-label"><span>03 / O PRODUTO</span><span>O KINDRA É REAL</span></div>
          <div className="landing-product-heading">
            <h2 id="product-title">Uma rotina.<br /><span>Um lugar.</span></h2>
            <p>O seu dia ganha contexto: treino, alimentação e registros acessíveis na mesma experiência.</p>
          </div>
          <motion.figure className="landing-product-figure" initial={reduceMotion ? false : { clipPath: 'inset(0 0 12% 0)', opacity: 0.7 }} whileInView={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <div className="landing-product-gallery">
              <div className="landing-product-screen landing-product-screen-home">
                <span>01 / Seu dia</span>
                <div className="landing-product-viewport"><img src={productHome} width="390" height="1923" loading="lazy" alt="Tela atual da Home do Kindra com saudação e ofensiva" /></div>
              </div>
              <div className="landing-product-screen landing-product-screen-nutrition">
                <span>02 / Nutrição</span>
                <div className="landing-product-viewport"><img src={productNutrition} width="390" height="995" loading="lazy" alt="Tela atual de Nutrição com balanço do dia, macronutrientes e registro de alimentos" /></div>
              </div>
              <div className="landing-product-screen landing-product-screen-workouts">
                <span>03 / Treinos</span>
                <div className="landing-product-viewport"><img src={productWorkouts} width="390" height="1377" loading="lazy" alt="Tela atual de Treinos com rotina do dia e planejamento semanal" /></div>
              </div>
            </div>
            <figcaption>Telas reais do Kindra · dados demonstrativos</figcaption>
          </motion.figure>
        </section>

        <section className="landing-progress public-container" aria-labelledby="progress-title">
          <div className="landing-section-label"><span>04 / O CAMINHO</span><span>PROGRESSO</span></div>
          <div className="landing-progress-layout">
            <div>
              <h2 id="progress-title">O progresso<br />tem memória<span>.</span></h2>
              <p>Um treino concluído. Uma refeição registrada. Uma marca revisitada. O Kindra ajuda você a enxergar o que está construindo.</p>
              <div className="landing-progress-notes" aria-label="O que você pode acompanhar"><span>Treinos</span><span>Alimentação</span><span>Evolução</span></div>
            </div>
            <img src={guardianCelebrating} width="300" height="329" loading="lazy" alt="Guardian Totem celebrando" />
          </div>
        </section>

        <section className="landing-guardian-moment" aria-labelledby="guardian-title">
          <div className="public-container landing-guardian-inner">
            <img src={guardianSad} width="262" height="329" loading="lazy" alt="Guardian Totem em momento de pausa" />
            <div><p className="landing-moment-overline">PRESENÇA, TODOS OS DIAS</p><h2 id="guardian-title">Nem todo dia<br />vai ser fácil.<br /><span>Continue mesmo assim.</span></h2><p>O importante é poder voltar.</p></div>
          </div>
        </section>

        <section className="landing-start public-container" aria-labelledby="start-title">
          <p className="landing-moment-overline">SEU PRÓXIMO PASSO</p>
          <h2 id="start-title">Comece hoje<span>.</span><br />Continue amanhã.</h2>
          <div className="landing-start-actions"><Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/login" className="landing-text-link">Já usa o Kindra? Entrar <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        </section>
      </main>
      <footer className="public-footer public-container"><Link to="/" aria-label="Kindra — página inicial"><Brand /></Link><nav aria-label="Links do rodapé" className="landing-footer-links"><Link to="/register">Criar conta</Link><Link to="/login">Já tenho conta</Link><a href="#conteudo">Voltar ao início ↑</a></nav></footer>
    </div>
  );
}
