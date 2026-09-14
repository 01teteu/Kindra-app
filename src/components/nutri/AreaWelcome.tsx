import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CalendarDays, ChartNoAxesCombined, Droplets, Flame, GlassWater, Target, Utensils } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type Area = 'diario' | 'hidratacao';

interface AreaWelcomeProps {
  area: Area;
  userId?: string;
  children: ReactNode;
}

// Presentation preference only. Never used for goals, streaks or authorization.
// Also keeps dismissal usable when browser storage is unavailable.
const dismissedInMemory = new Set<string>();

const content = {
  diario: {
    label: 'Nutrição · Um dia de cada vez',
    title: 'Sua evolução também passa pelo prato.',
    description: 'Conheça sua alimentação, acompanhe suas metas e dê continuidade às escolhas que fazem sentido para você.',
    action: 'Ir para meu diário',
    visualLabel: 'Cada refeição conta',
    visualDescription: 'Do registro de hoje à constância que você constrói.',
    icon: Utensils,
    moments: [
      { icon: Utensils, title: 'Registre suas refeições', text: 'Busque os alimentos e ajuste a quantidade que consumiu.' },
      { icon: Target, title: 'Encontre seu equilíbrio', text: 'Compare calorias e macronutrientes com suas metas do dia.' },
      { icon: ChartNoAxesCombined, title: 'Veja sua constância', text: 'Acompanhe seu diário, seu peso e a evolução das ofensivas.' },
    ],
    streak: 'Sua ofensiva avança quando as metas de calorias, proteínas, carboidratos, gorduras e água são atendidas no mesmo dia, dentro dos critérios do Kindra.',
  },
  hidratacao: {
    label: 'Hidratação · Ao longo do dia',
    title: 'Construa sua meta, um copo de cada vez.',
    description: 'Dê espaço à água na sua rotina. Acompanhar o que você bebe ajuda a manter sua meta diária por perto, sem deixar tudo para depois.',
    action: 'Acompanhar minha água',
    visualLabel: 'Pequenos registros se somam',
    visualDescription: 'Seu consumo ao longo do dia, em um só lugar.',
    icon: Droplets,
    moments: [
      { icon: GlassWater, title: 'Bebeu? Registre.', text: 'Use as quantidades rápidas ou informe quanto você bebeu.' },
      { icon: Droplets, title: 'Acompanhe o total', text: 'Veja o consumo acumulado e quanto falta para sua meta diária.' },
      { icon: CalendarDays, title: 'Dê continuidade amanhã', text: 'Consulte seus registros e acompanhe os dias anteriores no histórico.' },
    ],
    streak: 'A meta de água é uma parte da sua ofensiva. Para o dia contar, as metas de alimentação também precisam ser atendidas conforme os critérios do Kindra.',
  },
} as const;

function hasDismissed(key: string, canPersist: boolean): boolean {
  if (dismissedInMemory.has(key)) return true;
  if (!canPersist) return false;
  try {
    return window.localStorage.getItem(key) === 'seen';
  } catch {
    console.warn('Kindra: a preferência de apresentação ficará apenas em memória nesta sessão.');
    return false;
  }
}

// Keep presentation state scoped to the current identity, including account changes.
export function AreaWelcome({ area, userId, children }: AreaWelcomeProps) {
  const storageKey = `kindra:area-welcome:v1:${userId || 'session'}:${area}`;
  const [preference, setPreference] = useState(() => ({ key: storageKey, dismissed: hasDismissed(storageKey, Boolean(userId)) }));
  const { dismissed } = preference;
  const panelRef = useRef<HTMLElement>(null);
  const moveFocus = useRef(false);
  const reduceMotion = useReducedMotion();
  const copy = content[area];
  const Icon = copy.icon;

  useEffect(() => {
    if (dismissed && moveFocus.current) {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      moveFocus.current = false;
    }
  }, [dismissed]);

  const continueToContent = () => {
    dismissedInMemory.add(storageKey);
    if (userId) {
      try {
        window.localStorage.setItem(storageKey, 'seen');
      } catch {
        console.warn('Kindra: não foi possível salvar a apresentação; o acesso ao conteúdo permanece disponível.');
      }
    }
    moveFocus.current = true;
    setPreference({ key: storageKey, dismissed: true });
  };

  if (preference.key !== storageKey) {
    moveFocus.current = false;
    setPreference({ key: storageKey, dismissed: hasDismissed(storageKey, Boolean(userId)) });
    return null;
  }

  return (
    <section ref={panelRef} id={`panel-${area}`} role="tabpanel" aria-labelledby={`tab-${area}`} tabIndex={-1}>
      {dismissed ? children : (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-kindra-200 px-5 py-3 sm:px-8">
              <span className="eyebrow shrink-0 whitespace-nowrap">Boas-vindas</span>
              <Button type="button" variant="ghost" size="sm" className="px-0" onClick={continueToContent}>Pular apresentação</Button>
            </div>
            <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2 lg:gap-12">
              <div className="flex flex-col items-start justify-center">
                <p className="eyebrow">{copy.label}</p>
                <h2 className="mt-4 max-w-lg font-display text-3xl font-semibold leading-tight tracking-tight text-kindra-950 sm:text-4xl">{copy.title}</h2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-kindra-500">{copy.description}</p>
                <Button type="button" onClick={continueToContent} className="mt-6 w-full sm:w-auto">
                  {copy.action}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Button>
              </div>
              <div className="rounded-2xl border border-kindra-200 bg-kindra-50 p-5 sm:p-6">
                <div className="flex items-center gap-4 border-b border-kindra-200 pb-5">
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center border border-kindra-300 text-teal-300 ${area === 'diario' ? 'rounded-full' : 'rounded-2xl'}`}>
                    <Icon className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-kindra-900">{copy.visualLabel}</p>
                    <p className="mt-1 text-sm leading-relaxed text-kindra-500">{copy.visualDescription}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-5" aria-label={area === 'diario' ? 'Nutrição no dia a dia' : 'Hidratação no dia a dia'}>
                  {copy.moments.map(({ icon: MomentIcon, title, text }) => (
                    <li key={title} className="flex items-start gap-3">
                      <MomentIcon className="mt-0.5 h-5 w-5 shrink-0 text-kindra-400" strokeWidth={1.5} aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-semibold text-kindra-900">{title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-kindra-500">{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-kindra-200 px-5 py-5 sm:px-8">
              <Flame className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-kindra-900">Alimentação e água. A mesma constância.</p>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-kindra-500">{copy.streak}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </section>
  );
}
