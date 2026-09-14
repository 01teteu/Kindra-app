import { Link } from 'react-router-dom';
import { ArrowRight, Target } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Onboarding } from './Onboarding';

export function Settings() {
  return (
    <div className="page-container">
      <div className="page-heading">
        <div><h1 className="text-kindra-950">Configurações</h1><p className="mt-2 text-sm text-kindra-500">Ajustes para o seu momento.</p></div>
      </div>
      <Card className="max-w-3xl p-5 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-kindra-200 text-teal-300"><Target className="h-6 w-6" aria-hidden="true" /></div>
          <div>
            <h2 className="text-xl font-display font-semibold text-kindra-950">Metas nutricionais</h2>
            <p className="mt-2 text-sm leading-relaxed text-kindra-500">Seu corpo, sua rotina e seus objetivos podem mudar. Revise as respostas do seu perfil para manter as metas de alimentação e água alinhadas ao seu momento.</p>
          </div>
        </div>
        <Link to="/settings/nutrition" className="kindra-button button-primary mt-6 w-full sm:w-auto">Editar metas nutricionais<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </Card>
    </div>
  );
}

export function NutritionSettings() {
  return (
    <div className="page-container">
      <div className="page-heading"><div><h1 className="text-kindra-950">Editar metas nutricionais</h1><p className="mt-2 text-sm text-kindra-500">Suas respostas atuais, prontas para revisar.</p></div></div>
      <Onboarding mode="edit" />
    </div>
  );
}
