import { Sheet } from './Sheet';
import { X } from 'lucide-react';
import { Button } from './Button';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export function TermsModal({ isOpen, onClose, onAccept }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onClose={onClose} label="Termos de uso">
      <div className="sheet-panel relative flex flex-col p-5 sm:p-6">
        <button
          onClick={onClose}
          aria-label="Fechar termos de uso"
          type="button"
          className="absolute top-5 right-5 p-2 text-kindra-400 hover:text-kindra-950 transition-colors bg-kindra-200/30 hover:bg-kindra-200/50 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6 pr-10">
          <h2 className="text-2xl sm:text-[28px] font-display font-bold text-kindra-950 leading-tight">
            Termos de Uso
          </h2>
          <p className="text-[15px] font-medium text-kindra-500 mt-1">
            Diretrizes e regras do Kindra
          </p>
        </div>

        <div className="prose prose-sm max-w-none text-kindra-500 space-y-5 overflow-y-auto pr-2 custom-scrollbar flex-1 mb-6">
          <div>
            <h3 className="text-kindra-950 font-bold text-lg mb-1">1. Aceitação dos Termos</h3>
            <p className="leading-relaxed">
              Ao criar uma conta e utilizar o software Kindra, você concorda em cumprir e ser regido por estes Termos de Uso.
              Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
            </p>
          </div>

          <div>
            <h3 className="text-kindra-950 font-bold text-lg mb-1">2. Propriedade Intelectual</h3>
            <p className="leading-relaxed">
              Todo o conteúdo presente neste software, incluindo mas não se limitando a textos, gráficos, logotipos, ícones,
              imagens e código-fonte, é de propriedade exclusiva da Kindra e está protegido pelas leis de direitos autorais e de propriedade intelectual.
            </p>
          </div>

          <div>
            <h3 className="text-kindra-950 font-bold text-lg mb-1">3. Privacidade e Proteção de Dados</h3>
            <p className="leading-relaxed">
              O tratamento de seus dados pessoais, incluindo endereço de e-mail e credenciais de acesso, é realizado de acordo com nossa Política de Privacidade.
              Nós nos comprometemos a não compartilhar suas informações com terceiros não autorizados.
            </p>
          </div>

          <div>
            <h3 className="text-kindra-950 font-bold text-lg mb-1">4. Limitação de Responsabilidade</h3>
            <p className="leading-relaxed">
              O software é fornecido "no estado em que se encontra", sem garantias de qualquer tipo.
              Não nos responsabilizamos por quaisquer danos diretos, indiretos, incidentais ou consequenciais decorrentes do uso ou da incapacidade de usar nossos serviços.
            </p>
          </div>

          <div>
            <h3 className="text-kindra-950 font-bold text-lg mb-1">5. Modificações nos Termos</h3>
            <p className="leading-relaxed">
              Reservamo-nos o direito de atualizar ou modificar estes Termos de Uso a qualquer momento, sem aviso prévio.
              Recomendamos que você revise esta página periodicamente.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-kindra-200/50 mt-auto shrink-0">
          <Button variant="outline" className="flex-1 h-12 text-[15px] rounded-xl font-bold" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button className="flex-1 h-12 text-[15px] rounded-xl font-bold bg-teal-400 text-kindra-base border-0 hover:bg-teal-300" onClick={onAccept} type="button">
            Li e Concordo
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
