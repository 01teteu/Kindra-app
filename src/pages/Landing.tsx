import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Check } from 'lucide-react';
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
            <p className="public-context">Treino e nutrição em um só lugar</p>
            <h1 id="hero-title">Organize seu treino.<br />Acompanhe sua alimentação.</h1>
            <p className="public-lead">Monte sua semana, registre séries, refeições e água e consulte seus registros para acompanhar sua evolução.</p>
            <div className="public-actions">
              <Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a href="#seu-dia" className="kindra-button button-ghost">Conhecer o Kindra <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
          </div>

          <figure className="kindra-card public-week" aria-labelledby="week-title" aria-describedby="week-caption">
            <figcaption id="week-caption" className="public-demo-caption">Exemplo de uso · dados demonstrativos</figcaption>
            <div className="public-week-heading">
              <h2 id="week-title">Minha semana</h2>
              <p>Um lugar para cada treino.<br />Espaço para descansar também.</p>
            </div>
            <ol className="public-week-days">
              {[
                { day: 'Seg', name: 'Treino A', detail: '4 exercícios' },
                { day: 'Ter', name: 'Descanso' },
                { day: 'Qua', name: 'Treino B', detail: '4 exercícios', today: true },
                { day: 'Qui', name: 'Descanso' },
                { day: 'Sex', name: 'Treino A', detail: '4 exercícios' },
                { day: 'Sáb', name: 'Descanso' },
                { day: 'Dom', name: 'Descanso' },
              ].map(({ day, name, detail, today }) => (
                <li key={day} className={today ? 'public-week-current' : undefined}>
                  <span className="public-week-day">{day}{today && <small>Hoje</small>}</span>
                  <span className={detail ? 'public-week-routine' : 'public-week-rest'}>{name}</span>
                  {detail && <span className="public-week-count">{detail}</span>}
                </li>
              ))}
            </ol>
            <p className="public-week-note">Você escolhe os dias e organiza suas rotinas.</p>
          </figure>
        </section>

        <section id="seu-dia" className="public-benefits public-container" aria-labelledby="benefits-title">
          <div className="public-section-heading">
            <h2 id="benefits-title">Da semana planejada<br />ao treino registrado.</h2>
            <p>Organize suas rotinas, encontre exercícios e registre o que fez em cada série.</p>
          </div>
          <div className="public-feature-row">
            <div className="public-feature-copy">
              <p className="public-context">Durante o treino</p>
              <h3>Cada série tem seu registro.</h3>
              <p>Anote carga e repetições e marque as séries concluídas. Seus registros ajudam a acompanhar a execução dos treinos.</p>
            </div>
            <figure className="public-example" aria-labelledby="sets-title" aria-describedby="sets-caption">
              <figcaption id="sets-caption" className="public-demo-caption">Exemplo de uso · dados demonstrativos</figcaption>
              <h3 id="sets-title">Supino reto</h3>
              <table className="public-set-table">
                <caption className="sr-only">Registro demonstrativo de três séries de supino reto</caption>
                <thead><tr><th scope="col">Série</th><th scope="col">Carga</th><th scope="col">Reps</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {[1, 2, 3].map(series => (
                    <tr key={series}>
                      <th scope="row">{series}</th><td>20 kg</td><td>10</td>
                      <td><span className="public-set-done"><Check size={16} aria-hidden="true" /><span className="public-set-status">Concluída</span></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          </div>
        </section>

        <section className="public-feature-row public-container public-nutrition" aria-labelledby="nutrition-title">
          <div className="public-feature-copy">
            <p className="public-context">Alimentação e hidratação</p>
            <h2 id="nutrition-title">Entenda os registros<br />do seu dia.</h2>
            <p>Reúna suas refeições e acompanhe calorias e nutrientes em relação às suas metas. Registre a água ao longo do dia.</p>
          </div>
          <figure className="kindra-card public-nutrition-example" aria-labelledby="balance-title" aria-describedby="nutrition-caption">
            <figcaption id="nutrition-caption" className="public-demo-caption">Exemplo de uso · dados demonstrativos</figcaption>
            <h3 id="balance-title">Balanço do dia</h3>
            <p className="public-balance"><strong className="metric-number">800</strong><span>kcal restantes</span></p>
            <div className="public-balance-labels"><span>1.200 consumidas</span><span>Meta: 2.000 kcal</span></div>
            <div className="metric-rail" aria-hidden="true"><span style={{ width: '60%' }} /></div>
            <dl className="public-macros">
              <div><dt>Proteínas</dt><dd>50 g <span>restantes</span></dd></div>
              <div><dt>Carboidratos</dt><dd>105 g <span>restantes</span></dd></div>
              <div><dt>Gorduras</dt><dd>20 g <span>restantes</span></dd></div>
            </dl>
            <dl className="public-meals">
              <div><dt>Café da manhã</dt><dd>400 kcal</dd></div>
              <div><dt>Almoço</dt><dd>800 kcal</dd></div>
              <div><dt>Água registrada</dt><dd>1.500 ml <span>de 2.500 ml</span></dd></div>
            </dl>
          </figure>
        </section>

        <section className="public-feature-row public-container public-history" aria-labelledby="history-title">
          <div className="public-feature-copy">
            <p className="public-context">Acompanhamento</p>
            <h2 id="history-title">Seus registros<br />não ficam para trás.</h2>
            <p>Consulte o histórico diário de alimentação e hidratação. Registre seu peso e veja a data da última atualização.</p>
          </div>
          <figure className="public-example" aria-labelledby="history-example-title" aria-describedby="history-caption">
            <figcaption id="history-caption" className="public-demo-caption">Exemplo de uso · dados demonstrativos</figcaption>
            <h3 id="history-example-title">Histórico diário</h3>
            <ol className="public-history-days">
              <li><time dateTime="2026-09-16">16 de setembro</time><span>1.920 kcal <span aria-hidden="true">·</span> 2.300 ml de água</span></li>
              <li><time dateTime="2026-09-15">15 de setembro</time><span>2.040 kcal <span aria-hidden="true">·</span> 2.500 ml de água</span></li>
            </ol>
            <dl className="public-weight"><div><dt>Peso atual</dt><dd>75,5 <span>kg</span></dd></div><div><dt>Último registro</dt><dd><time dateTime="2026-09-16">16 de setembro</time></dd></div></dl>
          </figure>
        </section>

        <section className="public-start public-container" aria-labelledby="start-title">
          <div><h2 id="start-title">Comece pela sua rotina.</h2><p>Crie sua conta para organizar treino e alimentação no Kindra.</p></div>
          <Link to="/register" className="kindra-button button-primary button-lg">Criar conta <ArrowUpRight size={18} aria-hidden="true" /></Link>
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
