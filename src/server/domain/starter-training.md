# Base inicial de treino

## Contrato

`POST /api/workouts/plans/generate`, autenticado com escopo `session`.

```json
{ "trainingDaysPerWeek": 3, "equipment": ["MACHINE", "CABLE", "DUMBBELL"] }
```

Frequência inteira 2, 3 ou 4. Equipamentos: lista não vazia, sem repetição,
com valores do vocabulário atual do catálogo. Campos extras são rejeitados.
O usuário escolhe ambos explicitamente; nenhum campo novo é salvo no perfil.
Retorno 201: o DTO existente de WeeklyTrainingPlan, com resumo das rotinas nos dias.

O perfil existente é consultado no backend. Perfil ausente: 409, solicitando
conclusão do perfil. Qualquer limitação física cadastrada: 422, explicando que
o gerador ainda não adapta exercícios e oferecendo montagem manual. `isPCD`
isoladamente não é convertido em limitação. Objetivo não é duplicado ou alterado;
nível de atividade não é convertido em experiência. Esta base não varia por
objetivo/experiência e não fornece adaptação clínica nem classificação de dificuldade.

## Estrutura determinística

| Frequência | Rotinas criadas | Associação semanal |
| --- | --- | --- |
| 2 | Full Body A, Full Body B | Segunda A, quinta B |
| 3 | Full Body A, Full Body B | Segunda A, quarta B, sexta A |
| 4 | Upper A, Lower A, Upper B, Lower B | Segunda Upper A, terça Lower A, quinta Upper B, sexta Lower B |

Em três dias, A é uma única Routine usada duas vezes; editá-la muda ambas as
associações. Nos demais dias não há WeeklyTrainingDay. A distribuição é fixa,
sem relógio ou timezone, com intervalos entre sessões Full Body e entre pares
Upper/Lower. A divisão organiza os grupos em poucas estruturas; não representa
uma prescrição ideal para cada pessoa.

Cada bloco exige o primaryMuscle indicado e um movementPattern da lista,
em ordem de preferência:

| Bloco | primaryMuscle | movementPattern, por prioridade |
| --- | --- | --- |
| Quadríceps | QUADS | LEG_PRESS, SQUAT, KNEE_DOMINANT_SQUAT |
| Posteriores | HAMSTRINGS | KNEE_FLEXION, HIP_HINGE |
| Peito | CHEST | HORIZONTAL_PRESS, INCLINE_PRESS |
| Costas | BACK | HORIZONTAL_PULL, VERTICAL_PULL |
| Ombros | SHOULDERS | OVERHEAD_PRESS, LATERAL_RAISE |
| Abdômen | CORE | TRUNK_FLEXION, ANTI_ROTATION |
| Glúteos | GLUTES | HIP_THRUST, HIP_EXTENSION |
| Panturrilha | CALVES | PLANTAR_FLEXION |
| Bíceps | BICEPS | ELBOW_FLEXION |
| Tríceps | TRICEPS | ELBOW_EXTENSION, OVERHEAD_ELBOW_EXTENSION |

- Full Body A: quadríceps, peito, costas, posteriores, ombros, abdômen (6).
- Full Body B: mesma ordem; prioridades de padrões invertidas, exceto abdômen.
- Upper A: peito, costas exclusivamente HORIZONTAL_PULL, ombros, costas
  exclusivamente VERTICAL_PULL, bíceps, tríceps (6).
- Lower A: quadríceps, posteriores, glúteos, panturrilha, abdômen (5).
- Upper B/Lower B: mesmos blocos de A com prioridades de padrões invertidas.

São blocos definidos pelo vocabulário real, não listas paralelas de exercícios.
As variantes mudam a prioridade dos padrões, sem exigir exercícios diferentes
entre rotinas quando o catálogo não oferece variantes. Não há repetição de ID
dentro de uma rotina. `order` começa em zero; `notes` e `restTime` ficam nulos.
Não são prescritos séries, repetições, cargas, descanso, progressão ou periodização.

## Seleção

O backend fornece à função pura somente exercícios ativos globais sem dono ou
customizados do usuário autenticado. Exige WEIGHT_REPS e equipamento informado;
metadados de músculo/padrão incompatíveis ou ausentes não completam um bloco.

Dentro de cada bloco, ordenação estável por:

1. Prioridade do movementPattern na tabela/variante.
2. Equipamento: MACHINE, PLATE_LOADED, CABLE, SMITH_MACHINE, DUMBBELL, BARBELL,
   EZ_BAR, TRAP_BAR, KETTLEBELL, BAND, LANDMINE, PLATE, BODYWEIGHT, RINGS, OTHER.
3. Lateralidade: BILATERAL, UNILATERAL, ALTERNATING, desconhecida/nula.
4. Slug, origem, ID em comparação lexical independente de locale.

As prioridades são regras de composição, não uma escala de segurança/dificuldade.
Customizados continuam elegíveis e, empatados nos critérios anteriores, origem
CUSTOM precede GLOBAL lexicalmente. SecondaryMuscles e muscleRegion não são
usados para inferir dificuldade, contraindicações ou substituir primaryMuscle.
O equipamento representa somente o metadado existente, sem inferir acessórios.

Mesma entrada e mesmo catálogo elegível produzem a mesma estrutura, independentemente
da ordem dos resultados SQL ou da lista de equipamentos. Alterações futuras no
catálogo podem mudar uma nova geração; IDs das entidades recém-criadas serão novos.
Bloco sem candidato resulta em 422 identificando o grupo ausente, sem expor IDs privados.

## Persistência e edição

Uma transação Prisma Serializable engloba perfil, catálogo, decisão, locks
compartilhados dos exercícios selecionados, todas as Routines/RoutineExercises,
plano source=GENERATED e WeeklyTrainingDays. Segue o retry limitado existente
para conflitos; falha em qualquer etapa ou constraint reverte tudo.

Sem plano ativo, o novo fica ativo. Existindo um ativo, o novo fica inativo;
ativação usa a ação explícita existente. Índice de ativo único e constraints de
ownership continuam valendo, inclusive em concorrência.

Nova ação gera entidades novas; não altera/apaga planos ou rotinas anteriores.
GENERATED é apenas proveniência, sem sincronização, regeneração automática ou
JSON persistido. Minha Semana e Routine Builder editam as entidades normais.
Iniciar treino usa o start existente e seus snapshots. Edição posterior não
modifica sessões históricas.

A UI oferece geração no estado sem plano, com inputs sem defaults, pending que
impede submits simultâneos e erro preservando o formulário. Sucesso incorpora
o plano e os resumos únicos das rotinas da própria resposta, sem uma segunda
requisição que possa apresentar uma criação já confirmada como falha.

## Validação

```sh
node --import tsx src/server/domain/starter-training.test.ts
node --import tsx src/server/scripts/test-starter-training-state.ts
node --import tsx src/server/scripts/test-starter-training-api.ts
npm run lint
npm run build
node --import tsx src/server/scripts/test-starter-training-browser.ts
```

API e browser usam schema PostgreSQL isolado e migrations existentes, removido
no finally. Browser usa Chromium local e build em dist. API cobre falha forçada
na inserção de dia após criar as rotinas, preservação do ativo, concorrência,
ownership, recusa por limitações, edição e snapshots. Browser cobre uma rodada
representativa em 390, 1280 e 1920 pixels. Nenhuma migration nova é necessária.
