import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { ACTIVITY_LEVEL_OPTIONS, GOAL_OPTIONS } from '../shared/onboardingOptions';

interface CatalogOption {
  id: string;
  name: string;
}

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Catalog Options
  const [allergiesOptions, setAllergiesOptions] = useState<CatalogOption[]>([]);
  const [limitationsOptions, setLimitationsOptions] = useState<CatalogOption[]>([]);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    biologicalSex: '',
    weightKg: '',
    heightCm: '',
    activityLevel: '',
    goal: '',
    isPCD: false,
    allergies: [] as string[],
    hasOtherAllergy: false,
    otherAllergyText: '',
    limitations: [] as string[],
    hasOtherLimitation: false,
    otherLimitationText: ''
  });

  const loadData = () => {
    setIsInitializing(true);
    setFetchError('');
    
    // 1. Verifica estado real no backend (ignora cache/localStorage)
    apiFetch('/auth/me')
      .then(user => {
        if (user.hasProfile) {
          navigate('/home'); // Já tem perfil, não pode refazer o onboarding
        } else {
          // Se não tem perfil, carrega os catálogos
          return apiFetch('/profile/options');
        }
      })
      .then(res => {
        if (res) { // res is from /profile/options
          setAllergiesOptions(res.allergies || []);
          setLimitationsOptions(res.limitations || []);
        }
        setIsInitializing(false);
      })
      .catch((err) => {
        // Se for erro de auth, joga pro login
        if (err.status === 401 || err.status === 403) {
          navigate('/login');
        } else {
          // Outro erro (rede, timeout, 500)
          setFetchError(err.message || 'Falha ao conectar com o servidor.');
          setIsInitializing(false);
        }
      });
  };

  useEffect(() => {
    loadData();
  }, [navigate]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleToggle = (
    field: 'allergies' | 'limitations', 
    id: string, 
    otherField: 'hasOtherAllergy' | 'hasOtherLimitation'
  ) => {
    const options = field === 'allergies' ? allergiesOptions : limitationsOptions;
    const nenhumaId = options.find(opt => opt.name.toLowerCase() === 'nenhuma')?.id;

    setFormData(prev => {
      let newArr = [...prev[field]];
      let newHasOther = prev[otherField];

      if (id === nenhumaId) {
        newArr = [nenhumaId];
        newHasOther = false;
      } else if (id === 'Outras') {
        newHasOther = !newHasOther;
        if (newHasOther && nenhumaId) {
          newArr = newArr.filter(a => a !== nenhumaId);
        }
      } else {
        if (nenhumaId) {
          newArr = newArr.filter(a => a !== nenhumaId);
        }
        if (newArr.includes(id)) {
          newArr = newArr.filter(a => a !== id);
        } else {
          newArr.push(id);
        }
      }
      return { ...prev, [field]: newArr, [otherField]: newHasOther };
    });
  };

  const validateStep = () => {
    if (step === 1) {
      return formData.firstName.length >= 2 && formData.lastName.length >= 2;
    }
    if (step === 2) {
      return formData.birthDate && formData.biologicalSex && Number(formData.weightKg) > 0 && Number(formData.heightCm) > 0;
    }
    if (step === 3) {
      return formData.activityLevel && formData.goal;
    }
    if (step === 4) {
      const isAllergiesValid = (formData.allergies.length > 0 || formData.hasOtherAllergy) && 
                               (!formData.hasOtherAllergy || formData.otherAllergyText.trim().length > 0);
      const isLimitationsValid = (formData.limitations.length > 0 || formData.hasOtherLimitation) && 
                                 (!formData.hasOtherLimitation || formData.otherLimitationText.trim().length > 0);
      return Boolean(isAllergiesValid && isLimitationsValid);
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setServerError('');
      
      const {
        hasOtherAllergy, otherAllergyText,
        hasOtherLimitation, otherLimitationText,
        ...restFormData
      } = formData;

      await apiFetch('/profile', {
        data: {
          ...restFormData,
          allergies: [
            ...restFormData.allergies,
            ...(hasOtherAllergy && otherAllergyText.trim() ? [otherAllergyText.trim()] : [])
          ],
          limitations: [
            ...restFormData.limitations,
            ...(hasOtherLimitation && otherLimitationText.trim() ? [otherLimitationText.trim()] : [])
          ],
          weightKg: Number(restFormData.weightKg),
          heightCm: Number(restFormData.heightCm),
        }
      });
      navigate('/home');
    } catch (err: any) {
      if (err.message === 'O perfil deste usuário já foi criado.') {
        navigate('/home');
      } else {
        if (err.status) {
          setServerError(err.message);
        } else {
          setServerError('Erro de rede: não foi possível conectar ao servidor.');
        }
        setIsSubmitting(false);
      }
    }
  };

  const goals = GOAL_OPTIONS.map(id => ({
    id,
    label: id === 'Manutencao' ? 'Manutenção' : id,
    desc: id === 'Emagrecimento' ? 'Perder peso e reduzir medidas' : 
          id === 'Hipertrofia' ? 'Ganhar massa muscular' : 
          'Manter o peso e melhorar a saúde'
  }));

  const activityLevels = ACTIVITY_LEVEL_OPTIONS.map(id => ({
    id,
    label: id === 'Sedentario' ? 'Sedentário' : id,
    desc: id === 'Sedentario' ? 'Pouco ou nenhum exercício' :
          id === 'Leve' ? 'Exercício 1 a 3 dias na semana' :
          id === 'Moderado' ? 'Exercício 3 a 5 dias na semana' :
          'Exercício diário ou treinos pesados'
  }));

  // Animation variants
  const pageVariants = {
    initial: { opacity: 0, x: 20 },
    in: { opacity: 1, x: 0 },
    out: { opacity: 0, x: -20 },
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-kindra-50 flex items-center justify-center p-4">
        <div className="text-kindra-500 font-medium animate-pulse">Carregando dados...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-kindra-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Erro de Conexão</h2>
          <p className="text-gray-600 pb-4">{fetchError}</p>
          <Button onClick={loadData} className="w-full">
            Tentar Novamente
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kindra-50 flex flex-col items-center pt-10 px-4 relative overflow-hidden">
      {/* Background Ornaments */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-kindra-200/40 blur-[100px] pointer-events-none" />
      
      {/* Progress Bar */}
      <div className="w-full max-w-xl mb-8 z-10 relative">
        <div className="flex items-center gap-4 mb-2">
          {step > 1 && (
            <button onClick={handleBack} className="p-2 -ml-2 rounded-full text-kindra-500 hover:bg-kindra-200/50 hover:text-kindra-900 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="text-sm font-bold text-kindra-800 tracking-wider uppercase ml-auto">
            Etapa {step} de 4
          </span>
        </div>
        <div className="h-2 w-full bg-kindra-200 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-kindra-950"
            initial={{ width: '25%' }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Main Content */}
      <Card className="w-full max-w-xl z-10 relative">
        
        {serverError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
            {serverError}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STEP 1: Identification */}
          {step === 1 && (
            <motion.div
              key="step1"
              variants={pageVariants}
              initial="initial"
              animate="in"
              exit="out"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-kindra-950 mb-2">Qual é o seu nome?</h1>
                <p className="text-kindra-500 font-medium">Vamos personalizar a sua experiência.</p>
              </div>
              
              <div className="space-y-4">
                <Input
                  placeholder="Nome"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  autoFocus
                />
                <Input
                  placeholder="Sobrenome"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                />
              </div>
            </motion.div>
          )}

          {/* STEP 2: Basic Info */}
          {step === 2 && (
            <motion.div
              key="step2"
              variants={pageVariants}
              initial="initial"
              animate="in"
              exit="out"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-kindra-950 mb-2">Dados Básicos</h1>
                <p className="text-kindra-500 font-medium">Isso nos ajuda a calcular suas necessidades diárias.</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-kindra-700 uppercase tracking-wider mb-2">Data de Nascimento</label>
                  <Input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => handleChange('birthDate', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-kindra-700 uppercase tracking-wider mb-2">Sexo Biológico</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleChange('biologicalSex', 'MALE')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all duration-200 ${
                        formData.biologicalSex === 'MALE'
                          ? 'bg-kindra-950 border-kindra-950 text-kindra-base shadow-lg scale-[1.02]'
                          : 'bg-kindra-50 border-kindra-200 text-kindra-700 hover:border-kindra-300'
                      }`}
                    >
                      Masculino
                    </button>
                    <button
                      onClick={() => handleChange('biologicalSex', 'FEMALE')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all duration-200 ${
                        formData.biologicalSex === 'FEMALE'
                          ? 'bg-kindra-950 border-kindra-950 text-kindra-base shadow-lg scale-[1.02]'
                          : 'bg-kindra-50 border-kindra-200 text-kindra-700 hover:border-kindra-300'
                      }`}
                    >
                      Feminino
                    </button>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-kindra-700 uppercase tracking-wider mb-2">Peso (kg)</label>
                    <Input
                      type="number"
                      placeholder="Ex: 75.5"
                      value={formData.weightKg}
                      onChange={(e) => handleChange('weightKg', e.target.value)}
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-kindra-700 uppercase tracking-wider mb-2">Altura (cm)</label>
                    <Input
                      type="number"
                      placeholder="Ex: 175"
                      value={formData.heightCm}
                      onChange={(e) => handleChange('heightCm', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Goals and Activity */}
          {step === 3 && (
            <motion.div
              key="step3"
              variants={pageVariants}
              initial="initial"
              animate="in"
              exit="out"
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div>
                <h1 className="text-2xl font-display font-bold text-kindra-950 mb-4">Qual o seu objetivo principal?</h1>
                <div className="space-y-3">
                  {goals.map(g => (
                    <button
                      key={g.id}
                      onClick={() => handleChange('goal', g.id)}
                      className={clsx(
                        "w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 ease-out flex items-center justify-between",
                        formData.goal === g.id 
                          ? "border-kindra-950 bg-kindra-950 text-kindra-base shadow-lg scale-[1.02]" 
                          : "border-kindra-200 bg-kindra-50 hover:border-kindra-300 text-kindra-900"
                      )}
                    >
                      <div>
                        <div className="font-bold">{g.label}</div>
                        <div className={clsx("text-sm", formData.goal === g.id ? "text-kindra-200" : "text-kindra-500")}>
                          {g.desc}
                        </div>
                      </div>
                      {formData.goal === g.id && <Check className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-display font-bold text-kindra-950 mb-4">Como é a sua rotina de exercícios?</h1>
                <div className="space-y-3">
                  {activityLevels.map(a => (
                    <button
                      key={a.id}
                      onClick={() => handleChange('activityLevel', a.id)}
                      className={clsx(
                        "w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 ease-out flex items-center justify-between",
                        formData.activityLevel === a.id 
                          ? "border-kindra-950 bg-kindra-950 text-kindra-base shadow-lg scale-[1.02]" 
                          : "border-kindra-200 bg-kindra-50 hover:border-kindra-300 text-kindra-900"
                      )}
                    >
                      <div>
                        <div className="font-bold">{a.label}</div>
                        <div className={clsx("text-sm", formData.activityLevel === a.id ? "text-kindra-200" : "text-kindra-500")}>
                          {a.desc}
                        </div>
                      </div>
                      {formData.activityLevel === a.id && <Check className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Allergies and Limitations */}
          {step === 4 && (
            <motion.div
              key="step4"
              variants={pageVariants}
              initial="initial"
              animate="in"
              exit="out"
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div className="mb-2">
                <h1 className="text-3xl font-display font-bold text-kindra-950 mb-2">Para finalizar</h1>
                <p className="text-kindra-500 font-medium">Selecione suas restrições para montarmos um plano seguro.</p>
              </div>

              <div>
                <h2 className="text-sm font-bold text-kindra-700 uppercase tracking-wider mb-3">Alergias Alimentares</h2>
                <div className="flex flex-wrap gap-2">
                  {allergiesOptions.map(opt => {
                    const isSelected = formData.allergies.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleToggle('allergies', opt.id, 'hasOtherAllergy')}
                        className={clsx(
                          "px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border-2",
                          isSelected 
                            ? "bg-kindra-950 border-kindra-950 text-kindra-base scale-105" 
                            : "bg-kindra-50 border-kindra-200 text-kindra-700 hover:border-kindra-400"
                        )}
                      >
                        {opt.name}
                      </button>
                    );
                  })}
                  {allergiesOptions.length === 0 && <span className="text-sm text-kindra-400">Carregando...</span>}
                  
                  {allergiesOptions.length > 0 && (
                    <button
                      onClick={() => handleToggle('allergies', 'Outras', 'hasOtherAllergy')}
                      className={clsx(
                        "px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border-2",
                        formData.hasOtherAllergy
                          ? "bg-kindra-950 border-kindra-950 text-kindra-base scale-105" 
                          : "bg-kindra-50 border-kindra-200 text-kindra-700 hover:border-kindra-400"
                      )}
                    >
                      Outras
                    </button>
                  )}
                </div>
                {formData.hasOtherAllergy && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3"
                  >
                    <Input 
                      placeholder="Qual outra alergia?" 
                      value={formData.otherAllergyText}
                      onChange={e => handleChange('otherAllergyText', e.target.value)}
                      maxLength={50}
                      autoFocus
                    />
                  </motion.div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-bold text-kindra-700 uppercase tracking-wider mb-3">Limitações Físicas</h2>
                <div className="flex flex-wrap gap-2">
                  {limitationsOptions.map(opt => {
                    const isSelected = formData.limitations.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleToggle('limitations', opt.id, 'hasOtherLimitation')}
                        className={clsx(
                          "px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border-2",
                          isSelected 
                            ? "bg-kindra-950 border-kindra-950 text-kindra-base scale-105" 
                            : "bg-kindra-50 border-kindra-200 text-kindra-700 hover:border-kindra-400"
                        )}
                      >
                        {opt.name}
                      </button>
                    );
                  })}
                  {limitationsOptions.length === 0 && <span className="text-sm text-kindra-400">Carregando...</span>}
                  
                  {limitationsOptions.length > 0 && (
                    <button
                      onClick={() => handleToggle('limitations', 'Outras', 'hasOtherLimitation')}
                      className={clsx(
                        "px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border-2",
                        formData.hasOtherLimitation
                          ? "bg-kindra-950 border-kindra-950 text-kindra-base scale-105" 
                          : "bg-kindra-50 border-kindra-200 text-kindra-700 hover:border-kindra-400"
                      )}
                    >
                      Outras
                    </button>
                  )}
                </div>
                {formData.hasOtherLimitation && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3"
                  >
                    <Input 
                      placeholder="Qual outra limitação?" 
                      value={formData.otherLimitationText}
                      onChange={e => handleChange('otherLimitationText', e.target.value)}
                      maxLength={50}
                      autoFocus
                    />
                  </motion.div>
                )}
              </div>

              <div className="pt-4 border-t border-kindra-200">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={clsx(
                    "w-6 h-6 rounded border-2 flex items-center justify-center transition-colors",
                    formData.isPCD ? "bg-kindra-950 border-kindra-950" : "border-kindra-300 group-hover:border-kindra-500"
                  )}>
                    {formData.isPCD && <Check className="w-4 h-4 text-kindra-base" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={formData.isPCD}
                    onChange={(e) => handleChange('isPCD', e.target.checked)}
                  />
                  <span className="font-bold text-kindra-800">Sou Pessoa com Deficiência (PCD)</span>
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 flex justify-end">
          {step < 4 ? (
            <Button 
              onClick={handleNext} 
              disabled={!validateStep()}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
            >
              CONTINUAR
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              isLoading={isSubmitting}
              disabled={!validateStep()}
              className="w-full sm:w-auto"
            >
              FINALIZAR PERFIL
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
