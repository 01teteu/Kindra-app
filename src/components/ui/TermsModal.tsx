import { X } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export function TermsModal({ isOpen, onClose, onAccept }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col relative animate-in fade-in zoom-in-95 duration-200 shadow-2xl border border-kindra-800">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-2 text-kindra-400 hover:text-kindra-950 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="mb-6 text-center pr-8">
          <h2 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-[0.1em] text-kindra-950">
            Termos de Uso
          </h2>
        </div>

        <div className="prose prose-sm max-w-none text-kindra-500 space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1 mb-6">
          <h3 className="text-kindra-950 font-bold text-lg">1. Aceitação dos Termos</h3>
          <p>
            Ao criar uma conta e utilizar o software Kindra, você concorda em cumprir e ser regido por estes Termos de Uso.
            Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
          </p>

          <h3 className="text-kindra-950 font-bold text-lg">2. Propriedade Intelectual</h3>
          <p>
            Todo o conteúdo presente neste software, incluindo mas não se limitando a textos, gráficos, logotipos, ícones, 
            imagens e código-fonte, é de propriedade exclusiva da Kindra e está protegido pelas leis de direitos autorais e de propriedade intelectual.
          </p>

          <h3 className="text-kindra-950 font-bold text-lg">3. Privacidade e Proteção de Dados</h3>
          <p>
            O tratamento de seus dados pessoais, incluindo endereço de e-mail e credenciais de acesso, é realizado de acordo com nossa Política de Privacidade.
            Nós nos comprometemos a não compartilhar suas informações com terceiros não autorizados.
          </p>

          <h3 className="text-kindra-950 font-bold text-lg">4. Limitação de Responsabilidade</h3>
          <p>
            O software é fornecido "no estado em que se encontra", sem garantias de qualquer tipo. 
            Não nos responsabilizamos por quaisquer danos diretos, indiretos, incidentais ou consequenciais decorrentes do uso ou da incapacidade de usar nossos serviços.
          </p>

          <h3 className="text-kindra-950 font-bold text-lg">5. Modificações nos Termos</h3>
          <p>
            Reservamo-nos o direito de atualizar ou modificar estes Termos de Uso a qualquer momento, sem aviso prévio. 
            Recomendamos que você revise esta página periodicamente.
          </p>
        </div>

        <div className="flex gap-4 pt-4 border-t border-kindra-200">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button className="flex-1" onClick={onAccept} type="button">
            Li e Aceito
          </Button>
        </div>
      </Card>
    </div>
  );
}
