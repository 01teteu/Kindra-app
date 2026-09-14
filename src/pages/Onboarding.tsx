import { Brand } from '../components/ui/Brand';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { getEditableProfile, updateProfile } from '../lib/profile';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { ACTIVITY_LEVEL_OPTIONS, GOAL_OPTIONS } from '../shared/onboardingOptions';

interface CatalogOption {
  id: string;
  name: string;
}

export function Onboarding({ mode = 'create' }: { mode?: 'create' | 'edit' }) {
  const isEditing = mode === 'edit';
  const ContentTag = isEditing ? 'div' : 'main';
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusStep = () => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  };
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [saved, setSaved] = useState(false);

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

    if (isEditing) {
      Promise.all([getEditableProfile(), apiFetch('/profile/options')])
        .then(([profile, options]) => {
          const selectedAllergies = profile.allergies.map(link => link.allergy);
          const selectedLimitations = profile.physicalLimitations.map(link => link.physicalLimitation);
          const mergeOptions = (official: CatalogOption[], selected: CatalogOption[]) =>
            [...new Map([...official, ...selected].map(option => [option.id, option])).values()];
          setAllergiesOptions(mergeOptions(options.allergies, selectedAllergies));
          setLimitationsOptions(mergeOptions(options.limitations, selectedLimitations));
          setFormData({
            firstName: profile.firstName, lastName: profile.lastName,
            birthDate: profile.birthDate.slice(0, 10), biologicalSex: profile.biologicalSex || '',
            weightKg: String(profile.weightKg), heightCm: String(profile.heightCm),
            activityLevel: profile.activityLevel, goal: profile.goal, isPCD: profile.isPCD,
            allergies: selectedAllergies.map(option => option.id),
            limitations: selectedLimitations.map(option => option.id),
            hasOtherAllergy: false, otherAllergyText: '', hasOtherLimitation: false, otherLimitationText: '',
          });
          setIsInitializing(false);
        })
        .catch(err => {
          if (err.status === 401 || err.status === 403) navigate('/login');
          else { setFetchError(err.message || 'Não foi possível carregar suas respostas.'); setIsInitializing(false); }
        });
      return;
    }

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
  }, [navigate, isEditing]);

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

      const payload = {
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
        };
      if (isEditing) {
        await updateProfile(payload);
        setSaved(true);
        setIsSubmitting(false);
        return;
      }
      await apiFetch('/profile', { data: payload });
      navigate('/home');
    } catch (err: any) {
      if (!isEditing && err.message === 'O perfil deste usuário já foi criado.') {
        navigate('/home');
      } else {
        if (err.status) {
          setServerError(err.status === 429 ? 'Muitas tentativas. Aguarde um minuto antes de salvar novamente.' : err.message);
          if (isEditing && err.data?.details) {
            const groups = [['firstName', 'lastName'], ['birthDate', 'biologicalSex', 'weightKg', 'heightCm'], ['activityLevel', 'goal'], ['allergies', 'limitations', 'isPCD']];
            const invalidStep = groups.findIndex(fields => fields.some(field => err.data.details[field]?._errors?.length));
            if (invalidStep >= 0) setStep(invalidStep + 1);
          }
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

  const stages = [
    { label: 'Sobre você', title: 'Como podemos chamar você?', description: 'Vamos começar pelo seu nome. Ele vai acompanhar você por aqui.', hint: 'Informe nome e sobrenome com pelo menos 2 caracteres.', detail: 'Uma experiência com a sua identidade.' },
    { label: 'Seu corpo', title: 'Um ponto de partida', description: 'Esses dados ajudam a calcular suas necessidades diárias.', hint: 'Preencha a data, selecione o sexo biológico e informe peso e altura maiores que zero.', detail: 'Dados básicos para suas necessidades diárias.' },
    { label: 'Sua rotina', title: 'Na direção do seu objetivo', description: 'Escolha o que você busca e o ritmo que faz parte da sua rotina hoje.', hint: 'Selecione um objetivo e um nível de atividade.', detail: 'Seu objetivo e seu ritmo de atividade.' },
    { label: 'Seus cuidados', title: 'Os detalhes que importam', description: 'Conte quais restrições devemos considerar na sua experiência.', hint: 'Selecione uma opção em cada grupo, incluindo “Nenhuma”, se for o caso. Ao marcar “Outras”, descreva a restrição.', detail: 'Atenção às suas alergias e limitações.' },
  ];
  const currentStage = stages[step - 1];
  const selectionClass = (selected: boolean) => clsx(
    'min-h-12 rounded-xl border px-4 py-3 text-left text-sm transition-colors motion-reduce:transition-none',
    selected ? 'border-teal-400 bg-teal-500/10 text-teal-300' : 'border-kindra-300 bg-kindra-50 text-kindra-800 hover:border-kindra-500',
  );

  if (saved) {
    return (
      <Card className="p-6 sm:p-8 space-y-5">
        <div role="status" className="space-y-3">
          <Check className="h-8 w-8 text-teal-300" aria-hidden="true" />
          <h2 className="text-2xl font-display font-semibold text-kindra-950">Metas atualizadas</h2>
          <p className="text-sm leading-relaxed text-kindra-500">Suas respostas foram salvas. As metas de calorias, proteínas, carboidratos, gorduras e água foram recalculadas. Seus registros de consumo foram preservados.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate('/nutri')}>Ver minhas metas<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
          <Button variant="outline" onClick={() => navigate('/settings')}>Voltar às configurações</Button>
        </div>
      </Card>
    );
  }

  if (isInitializing || fetchError) {
    return (
      <div className={isEditing ? "w-full" : "onboarding-page"}>
        {!isEditing && <header className="w-full max-w-5xl mb-12"><Brand /></header>}
        <Card className="w-full max-w-md my-auto p-6 sm:p-8">
          {isInitializing ? (
            <div role="status" className="space-y-4">
              <Loader2 aria-hidden="true" className="h-6 w-6 text-teal-400 animate-spin motion-reduce:animate-none" />
              <h1 className="font-display font-bold text-kindra-950">{isEditing ? 'Carregando suas respostas' : 'Preparando seu início'}</h1>
              <p className="text-sm leading-relaxed text-kindra-500">Estamos carregando as informações para personalizar seu perfil.</p>
            </div>
          ) : (
            <div role="alert" className="space-y-4">
              <AlertCircle aria-hidden="true" className="h-6 w-6 text-rose-400" />
              <h1 className="font-display font-bold text-kindra-950">Não foi possível carregar</h1>
              <p className="text-sm text-kindra-500 break-words">{fetchError}</p>
              <Button onClick={loadData} className="w-full">Tentar novamente</Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className={isEditing ? "w-full" : "onboarding-page"}>
      {!isEditing && <header className="w-full max-w-5xl flex items-center justify-between gap-4 mb-8 lg:mb-12">
        <Brand />
        <span className="hidden sm:block eyebrow">Seu ritmo. Sua evolução.</span>
      </header>}
      {isEditing && <div className="mb-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate('/settings')} disabled={isSubmitting}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Cancelar edição</Button>
        <p className="border-l-2 border-teal-400 pl-4 text-sm leading-relaxed text-kindra-500">Ao salvar, suas metas de alimentação e água serão recalculadas com estas respostas. Os registros de consumo e os dias já consolidados serão preservados.</p>
      </div>}
      <ContentTag className="w-full max-w-5xl grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12 items-start">
        <aside className="lg:sticky lg:top-8">
          <div className="hidden lg:block mb-8">
            <p className="eyebrow mb-4">{isEditing ? 'Seu momento atual' : 'Seu começo no Kindra'}</p>
            <h2 className="text-3xl font-display font-bold tracking-tight leading-tight">{isEditing ? 'Sua rotina muda. Suas metas acompanham.' : <>Uma rotina que<br />começa com você.</>}</h2>
            <p className="text-sm text-kindra-500 leading-relaxed mt-4">{isEditing ? 'Revise suas respostas e ajuste o que mudou desde o seu início.' : 'Quatro passos para conhecer seu momento e preparar seu perfil.'}</p>
          </div>
          <nav aria-label={isEditing ? "Progresso da edição" : "Progresso do onboarding"}>
            <p className="text-sm text-kindra-500 mb-4" aria-live="polite">Etapa <span className="text-kindra-950 font-semibold">{step}</span> de 4 <span className="lg:hidden">· {currentStage.label}</span></p>
            <ol className="grid grid-cols-4 gap-2 lg:grid-cols-1 lg:gap-5">
              {stages.map((stage, index) => (
                <li key={stage.label} aria-current={step === index + 1 ? 'step' : undefined} className="min-w-0">
                  <div className={clsx('h-1 rounded-full lg:hidden', index < step ? 'bg-teal-400' : 'bg-kindra-200')} />
                  <div className="hidden lg:flex gap-3 items-start">
                    <span className={clsx('w-8 h-8 shrink-0 rounded-full border flex items-center justify-center text-xs font-semibold', index < step ? 'border-teal-400 text-teal-300 bg-teal-500/10' : 'border-kindra-300 text-kindra-500')}>
                      {index + 1 < step ? <Check className="w-4 h-4" aria-label="Concluída" /> : index + 1}
                    </span>
                    <div><p className={clsx('text-sm font-semibold', index + 1 === step ? 'text-teal-300' : 'text-kindra-700')}>{stage.label}</p><p className="text-xs leading-relaxed text-kindra-500 mt-1">{stage.detail}</p></div>
                  </div>
                  <span className="sr-only lg:hidden">{stage.label}{index + 1 < step ? ', concluída' : ''}</span>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <Card className="p-5 sm:p-8 shadow-none">
          <form noValidate onSubmit={event => {
            event.preventDefault();
            if (isSubmitting || !validateStep()) return;
            if (step < 4) handleNext();
            else void handleSubmit();
          }} aria-busy={isSubmitting}>
            <fieldset disabled={isSubmitting} className="min-w-0">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={step}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16 }}
                  onAnimationComplete={focusStep}
                >
                  <div className="mb-8">
                    <p className="eyebrow mb-3">{currentStage.label}</p>
                    <h1 ref={headingRef} tabIndex={-1} className="font-display font-bold text-kindra-950 leading-tight focus:outline-none">{currentStage.title}</h1>
                    <p className="mt-3 text-sm leading-relaxed text-kindra-500">{currentStage.description}</p>
                  </div>
                  {step === 1 && <div className="space-y-5">
                    <Input title="Nome" autoComplete="given-name" placeholder="Seu nome" value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} />
                    <Input title="Sobrenome" autoComplete="family-name" placeholder="Seu sobrenome" value={formData.lastName} onChange={e => handleChange('lastName', e.target.value)} />
                  </div>}
                  {step === 2 && <div className="space-y-6">
                    <Input title="Data de nascimento" type="date" autoComplete="bday" value={formData.birthDate} onChange={e => handleChange('birthDate', e.target.value)} />
                    <fieldset><legend className="text-sm font-medium text-kindra-700 mb-2">Sexo biológico</legend>
                      <div className="grid grid-cols-2 gap-3">{[{ id: 'MALE', label: 'Masculino' }, { id: 'FEMALE', label: 'Feminino' }].map(option => <button type="button" key={option.id} aria-pressed={formData.biologicalSex === option.id} onClick={() => handleChange('biologicalSex', option.id)} className={selectionClass(formData.biologicalSex === option.id)}>{option.label}</button>)}</div>
                    </fieldset>
                    <div className="grid grid-cols-2 gap-3 sm:gap-5">
                      <Input title="Peso (kg)" type="number" step="any" inputMode="decimal" placeholder="Ex: 75.5" value={formData.weightKg} onChange={e => handleChange('weightKg', e.target.value)} />
                      <Input title="Altura (cm)" type="number" step="any" inputMode="numeric" placeholder="Ex: 175" value={formData.heightCm} onChange={e => handleChange('heightCm', e.target.value)} />
                    </div>
                  </div>}
                  {step === 3 && <div className="space-y-8">
                    {[{ field: 'goal' as const, label: 'Seu objetivo principal', options: goals }, { field: 'activityLevel' as const, label: 'Sua rotina de exercícios', options: activityLevels }].map(group => <fieldset key={group.field}>
                      <legend className="text-sm font-semibold text-kindra-800 mb-3">{group.label}</legend>
                      <div className="space-y-2">{group.options.map(option => <button type="button" key={option.id} aria-pressed={formData[group.field] === option.id} onClick={() => handleChange(group.field, option.id)} className={clsx(selectionClass(formData[group.field] === option.id), 'w-full flex items-center justify-between gap-3')}>
                        <span><span className="block font-semibold">{option.label}</span><span className="block text-xs text-kindra-500 leading-relaxed mt-1">{option.desc}</span></span>
                        <span className={clsx('w-5 h-5 shrink-0 rounded-full border flex items-center justify-center', formData[group.field] === option.id ? 'border-teal-400' : 'border-kindra-300')} aria-hidden="true">{formData[group.field] === option.id && <Check className="w-3 h-3" />}</span>
                      </button>)}</div>
                    </fieldset>)}
                  </div>}
                  {step === 4 && <div className="space-y-8">
                    <p className="text-sm text-kindra-500 border-l-2 border-teal-400 pl-3">Você pode selecionar mais de uma opção. Se não tiver restrições, marque “Nenhuma” em cada grupo.</p>
                    {[
                      { field: 'allergies' as const, other: 'hasOtherAllergy' as const, text: 'otherAllergyText' as const, label: 'Alergias alimentares', inputLabel: 'Qual outra alergia?', options: allergiesOptions },
                      { field: 'limitations' as const, other: 'hasOtherLimitation' as const, text: 'otherLimitationText' as const, label: 'Limitações físicas', inputLabel: 'Qual outra limitação?', options: limitationsOptions },
                    ].map(group => <fieldset key={group.field}>
                      <legend className="text-sm font-semibold text-kindra-800 mb-3">{group.label}</legend>
                      <div className="flex flex-wrap gap-2">
                        {group.options.map(option => <button type="button" key={option.id} aria-pressed={formData[group.field].includes(option.id)} onClick={() => handleToggle(group.field, option.id, group.other)} className={clsx(selectionClass(formData[group.field].includes(option.id)), 'inline-flex items-center gap-2')}>
                          {formData[group.field].includes(option.id) && <Check className="w-4 h-4" aria-hidden="true" />}{option.name}
                        </button>)}
                        {group.options.length > 0 && <button type="button" aria-pressed={formData[group.other]} onClick={() => handleToggle(group.field, 'Outras', group.other)} className={selectionClass(formData[group.other])}>Outras</button>}
                      </div>
                      {group.options.length === 0 && <div role="alert" className="text-sm text-rose-400 space-y-2"><p>Não foi possível obter as opções deste grupo.</p><Button type="button" variant="outline" onClick={loadData}>Tentar novamente</Button></div>}
                      {formData[group.other] && <div className="mt-4"><Input title={group.inputLabel} placeholder="Descreva em até 50 caracteres" value={formData[group.text]} onChange={e => handleChange(group.text, e.target.value)} maxLength={50} autoFocus /></div>}
                    </fieldset>)}
                    <label className="flex items-center gap-3 min-h-12 border-t border-kindra-200 pt-5 cursor-pointer text-sm text-kindra-800">
                      <input type="checkbox" className="w-5 h-5 shrink-0 accent-teal-400" checked={formData.isPCD} onChange={e => handleChange('isPCD', e.target.checked)} />Sou Pessoa com Deficiência (PCD)
                    </label>
                  </div>}
                </motion.div>
              </AnimatePresence>
              <div className="mt-8 pt-5 border-t border-kindra-200">
                {serverError && <div role="alert" className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-400 break-words">{serverError}</div>}
                <p id="step-feedback" role="status" className="text-xs leading-relaxed text-kindra-500 mb-4">
                  {isSubmitting ? 'Salvando seu perfil. Aguarde um instante…' : !validateStep() ? currentStage.hint : step === 4 ? 'Tudo preenchido. Seu perfil está pronto para ser salvo.' : 'Tudo certo. Vamos para o próximo passo.'}
                </p>
                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
                  {step > 1 && <Button type="button" variant="ghost" onClick={handleBack}><ArrowLeft className="w-4 h-4" aria-hidden="true" />Voltar</Button>}
                  <Button type="submit" isLoading={isSubmitting} disabled={!validateStep()} aria-describedby="step-feedback" className="w-full sm:w-auto sm:ml-auto">
                    {isSubmitting ? 'Salvando perfil…' : step === 4 ? (isEditing ? 'Salvar e recalcular metas' : 'Finalizar perfil') : 'Continuar'}{!isSubmitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                  </Button>
                </div>
              </div>
            </fieldset>
          </form>
        </Card>
      </ContentTag>
      {!isEditing && <footer className="w-full max-w-5xl mt-8 text-xs text-kindra-500 text-center lg:text-right">Nutrição e treino no seu ritmo.</footer>}
    </div>
  );
}
