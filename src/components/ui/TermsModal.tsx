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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md">
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />
      
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col relative animate-in fade-in zoom-in-95 duration-200 shadow-2xl border-kindra-200/50 bg-kindra-100 p-6 sm:p-8 rounded-[32px]">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-6 right-6 p-2 text-kindra-400 hover:text-kindra-950 transition-colors bg-kindra-200/30 hover:bg-kindra-200/50 rounded-full"
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
          <Button className="flex-1 h-12 text-[15px] rounded-xl font-bold bg-teal-500 text-white border-0 hover:bg-teal-600" onClick={onAccept} type="button">
            Li e Concordo
          </Button>
        </div>
      </Card>
    </div>
  );
}
