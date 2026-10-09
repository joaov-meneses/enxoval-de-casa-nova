import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  Bath,
  BedDouble,
  Building2,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock,
  CloudSun,
  CookingPot,
  DoorOpen,
  Eye,
  EyeOff,
  Flower2,
  Heart,
  HeartHandshake,
  House,
  Laptop,
  Leaf,
  Moon,
  Link2,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PiggyBank,
  Receipt,
  Refrigerator,
  ShieldCheck,
  Share2,
  ShoppingBag,
  Snowflake,
  Sofa,
  Sparkles,
  Sun,
  TrendingDown,
  Trees,
  Truck,
  User,
  Users,
  Wallet,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "../Brand";
import { fetchBootstrap, register } from "../../api";
import { track } from "../../onboarding/analytics";
import { detectStateFromDevice } from "../../onboarding/location";
import {
  defaultPeople,
  defaultRooms,
  emptyAnswers,
  firstName,
  firstNightItems,
  formatEstimate,
  generatePlan,
  parseLocalDate,
  phaseOf,
  roomItemCounts,
  savingsFor,
  scheduleFor,
  SEASONS,
  STATES,
  stateInfo,
  toPayload,
  weeksUntil,
  type Phase,
  type SeasonTone,
} from "../../onboarding/plan";
import {
  clearOnboarding,
  detectSource,
  loadOnboarding,
  saveOnboarding,
} from "../../onboarding/storage";
import type {
  Answers,
  Budget,
  ExcludeReason,
  GeneratedPlan,
  Housing,
  Milestone,
  Moment,
  OptionalRoom,
  Owned,
  PlanStyle,
  RoomKey,
  Usage,
  Worry,
} from "../../onboarding/types";
import {
  CalendarPicker,
  CheckOptions,
  Confetti,
  CountUp,
  addMonthsISO,
  formatLongDate,
  itemVariants,
  Pie,
  RadioOptions,
  Ring,
  Stagger,
  WheelPicker,
  type Option,
} from "./controls";

/* -------------------------------------------------------------- passos */

const ALL_STEPS = [
  "welcome",
  "name",
  "greet",
  "moment",
  "date",
  "timeline",
  "state",
  "climate",
  "housing",
  "people",
  "rooms",
  "owned",
  "style",
  "budget",
  "worries",
  "usage",
  "thanks",
  "building",
  "ready",
  "savings",
  "firstnight",
  "schedule",
  "compare",
  "save",
] as const;
type StepId = (typeof ALL_STEPS)[number];

const isStepId = (value: string): value is StepId =>
  (ALL_STEPS as readonly string[]).includes(value);

function visibleSteps(answers: Answers, plan: GeneratedPlan): StepId[] {
  const hasKit = firstNightItems(plan).length > 0;
  return ALL_STEPS.filter((step) => {
    if (step === "timeline" || step === "schedule") return answers.moveDate !== null;
    if (step === "firstnight") return hasKit;
    return true;
  });
}

const TIMEZONE_STATES: Record<string, string> = {
  "America/Bahia": "BA",
  "America/Fortaleza": "CE",
  "America/Recife": "PE",
  "America/Belem": "PA",
  "America/Maceio": "AL",
  "America/Araguaina": "TO",
  "America/Manaus": "AM",
  "America/Cuiaba": "MT",
  "America/Campo_Grande": "MS",
  "America/Porto_Velho": "RO",
  "America/Boa_Vista": "RR",
  "America/Rio_Branco": "AC",
  "America/Noronha": "PE",
};

/** Ponto de partida da roleta. A pessoa confirma ou muda. */
function guessState() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_STATES[zone] ?? "SP";
  } catch {
    return "SP";
  }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/* ------------------------------------------------------------- opções */

const MOMENTS: Option<Moment>[] = [
  { value: "casal", label: "Vou morar com meu par", hint: "Casamento ou união", icon: <HeartHandshake size={20} /> },
  { value: "solo", label: "Vou morar sozinho(a)", hint: "O meu primeiro cantinho", icon: <User size={20} /> },
  { value: "amigos", label: "Vou dividir a casa", hint: "Com amigos ou família", icon: <Users size={20} /> },
  { value: "troca", label: "Estou trocando de casa", hint: "Já tenho algumas coisas", icon: <Truck size={20} /> },
];

const HOUSINGS: Option<Housing>[] = [
  { value: "apartamento", label: "Apartamento", hint: "Com ou sem varanda", icon: <Building2 size={20} /> },
  { value: "casa", label: "Casa", hint: "Com quintal ou área externa", icon: <House size={20} /> },
  { value: "studio", label: "Studio ou kitnet", hint: "Sala e quarto integrados", icon: <DoorOpen size={20} /> },
];

const OWNED: Option<Owned>[] = [
  { value: "nada", label: "Ainda nada", hint: "Começando do zero", icon: <Pie fill={0} /> },
  { value: "algumas", label: "Algumas coisas", hint: "Móveis ou utensílios soltos", icon: <Pie fill={1} /> },
  { value: "boa", label: "Boa parte", hint: "Só faltam algumas peças", icon: <Pie fill={2} /> },
];

const BUDGETS: Option<Budget>[] = [
  { value: "lt10", label: "Até R$ 10 mil" },
  { value: "10-25", label: "De R$ 10 a 25 mil" },
  { value: "25-50", label: "De R$ 25 a 50 mil" },
  { value: "gt50", label: "Mais de R$ 50 mil" },
  { value: "unknown", label: "Ainda não sei" },
];

const WORRIES: Option<Worry>[] = [
  { value: "start", label: "Não saber por onde começar", icon: <ListOrdered size={20} /> },
  { value: "waste", label: "Gastar com o que eu não vou usar", icon: <PiggyBank size={20} /> },
  { value: "forget", label: "Esquecer algo importante", icon: <ListChecks size={20} /> },
  { value: "budget", label: "Estourar o orçamento", icon: <Wallet size={20} /> },
  { value: "time", label: "Não dar conta do tempo", icon: <Clock size={20} /> },
];

const USAGES: Option<Usage>[] = [
  { value: "buy", label: "Saber o que comprar", icon: <ShoppingBag size={20} /> },
  { value: "spend", label: "Controlar quanto eu gasto", icon: <Wallet size={20} /> },
  { value: "links", label: "Salvar links de produtos", icon: <Link2 size={20} /> },
  { value: "share", label: "Dividir com quem mora comigo", icon: <Share2 size={20} /> },
];

const ROOM_ICONS: Record<RoomKey, LucideIcon> = {
  quarto: BedDouble,
  banheiro: Bath,
  cozinha: CookingPot,
  eletro: Refrigerator,
  servico: WashingMachine,
  sala: Sofa,
  quartoExtra: BedDouble,
  escritorio: Laptop,
  externa: Flower2,
};

const SEASON_NAMES = ["Verão", "Outono", "Inverno", "Primavera"];
const TONE_LABEL: Record<SeasonTone, string> = {
  calor: "calor",
  ameno: "ameno",
  fresco: "fresco",
  frio: "frio",
};

const WORRY_PAIN: Record<Worry, string> = {
  start: "Não saber por onde começar",
  waste: "Gastar com o que não vai usar",
  forget: "Esquecer algo importante",
  budget: "Estourar o orçamento",
  time: "Correr contra a data da mudança",
};
const DEFAULT_PAINS: Worry[] = ["waste", "forget", "start", "budget"];

const THANKS: Record<Moment, string> = {
  casal: "que bonito começar essa fase a dois.",
  solo: "que bom ter o seu próprio canto.",
  amigos: "casa cheia é casa viva.",
  troca: "recomeçar em outro lar também é um começo.",
};

/* --------------------------------------------------------- animações */

const EASE = [0.22, 1, 0.36, 1] as const;

const sectionVariants = {
  enter: (c: { dir: number; reduced: boolean }) => ({
    opacity: 0,
    x: c.reduced ? 0 : c.dir * 36,
  }),
  center: (c: { reduced: boolean }) => ({
    opacity: 1,
    x: 0,
    transition: { duration: c.reduced ? 0.15 : 0.34, ease: EASE },
  }),
  exit: (c: { dir: number; reduced: boolean }) => ({
    opacity: 0,
    x: c.reduced ? 0 : -c.dir * 28,
    transition: { duration: c.reduced ? 0.1 : 0.16, ease: "easeIn" as const },
  }),
};

/* -------------------------------------------------------------- fluxo */

export default function OnboardingFlow() {
  const reduced = !!useReducedMotion();
  const saved = useMemo(() => loadOnboarding(), []);
  const [hasProgress, setHasProgress] = useState(
    Boolean(saved && saved.step !== "welcome"),
  );
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...emptyAnswers,
    ...(saved?.answers ?? {}),
    source: saved?.answers.source || detectSource(),
  }));
  const [step, setStep] = useState<StepId>("welcome");
  const [dir, setDir] = useState(1);
  const [completed, setCompleted] = useState(saved?.completed ?? false);
  // O funil é só para quem ainda não tem conta: quem já está logado vai para a área logada.
  const [gate, setGate] = useState<"checking" | "open">("checking");
  useEffect(() => {
    let active = true;
    fetchBootstrap()
      .then(() => {
        if (active) window.location.replace("/app");
      })
      .catch(() => {
        if (active) setGate("open");
      });
    return () => {
      active = false;
    };
  }, []);

  const plan = useMemo(() => generatePlan(answers), [answers]);
  const steps = visibleSteps(answers, plan);
  const index = Math.max(steps.indexOf(step), 0);
  const first = firstName(answers.name);

  const set = useCallback(
    (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch })),
    [],
  );

  const stepRef = useRef(step);
  stepRef.current = step;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const goTo = useCallback(
    (target: StepId, direction: number) => {
      setDir(direction);
      setStep(target);
    },
    [],
  );

  const next = useCallback(() => {
    const list = stepsRef.current;
    const at = list.indexOf(stepRef.current);
    const target = list[at + 1];
    if (!target) return;
    track("step_complete", { step: stepRef.current, index: at });
    goTo(target, 1);
  }, [goTo]);

  const prev = useCallback(() => {
    const list = stepsRef.current;
    let at = list.indexOf(stepRef.current) - 1;
    while (at > 0 && list[at] === "building") at -= 1;
    if (at < 0) return false;
    track("onboarding_back", { step: stepRef.current });
    goTo(list[at], -1);
    return true;
  }, [goTo]);

  // Persistência: o que a pessoa respondeu sobrevive a recarregar ou fechar.
  useEffect(() => {
    if (step === "welcome" && !hasProgress && !answers.name) return;
    saveOnboarding({
      v: 2,
      answers,
      step: step === "building" ? "thanks" : step,
      completed,
    });
  }, [answers, step, completed, hasProgress]);

  useEffect(() => {
    if (step === "ready") {
      setCompleted(true);
      track("plan_ready", {
        items: plan.stats.total,
        rooms: plan.stats.rooms,
      });
    }
    track("step_view", { step, index });
    // Só reage à troca de tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    track("onboarding_start", { resumed: Boolean(saved) });
    document.title = "Monte o plano da sua casa nova | Larume";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Valores sugeridos entram na tela já selecionados; a pessoa confirma ou muda.
  useEffect(() => {
    if (step === "state" && !answers.state) set({ state: guessState() });
    if (step === "people" && answers.people == null)
      set({ people: defaultPeople(answers.moment) });
    if (step === "rooms" && answers.rooms == null)
      set({ rooms: defaultRooms(answers.housing, answers.people) });
  }, [step, answers.state, answers.people, answers.rooms, answers.moment, answers.housing, set]);

  // O botão voltar do navegador (e do Android) volta uma tela, em vez de sair do funil.
  useEffect(() => {
    if (!window.history.state?.ob) window.history.pushState({ ob: true }, "");
    const onPop = () => {
      if (stepRef.current === "welcome") {
        window.history.back();
        return;
      }
      window.history.pushState({ ob: true }, "");
      prev();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [prev]);

  const onShown = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const target =
      document.querySelector<HTMLElement>(".ob-section [data-autofocus]") ??
      document.querySelector<HTMLElement>(".ob-section h1");
    target?.focus({ preventScroll: true });
  }, []);

  const resetAll = () => {
    clearOnboarding();
    setAnswers({ ...emptyAnswers, source: detectSource() });
    setCompleted(false);
    setHasProgress(false);
  };

  const canContinue = (() => {
    switch (step) {
      case "name":
        return answers.name.trim().length >= 2;
      case "moment":
        return answers.moment !== null;
      case "date":
        return answers.moveDateAnswered;
      case "housing":
        return answers.housing !== null;
      case "rooms":
        return (answers.rooms ?? defaultRooms(answers.housing, answers.people)).length > 0;
      case "owned":
        return answers.owned !== null;
      case "style":
        return answers.style !== null;
      case "budget":
        return answers.budget !== null;
      default:
        return true;
    }
  })();

  const resume = () => {
    const target = saved && isStepId(saved.step) ? saved.step : "name";
    const list = visibleSteps(answers, plan);
    goTo(
      completed ? "ready" : list.includes(target) ? target : "name",
      1,
    );
  };

  const hideProgress = step === "welcome" || step === "building";
  const readyIndex = steps.indexOf("ready");
  const progress = hideProgress ? 0 : Math.min(index / readyIndex, 1);

  const footer = ((): {
    label: string;
    onClick: () => void;
    secondary?: ReactNode;
  } | null => {
    switch (step) {
      case "welcome":
        return {
          label: hasProgress
            ? completed
              ? "Ver meu plano"
              : "Continuar de onde parei"
            : "Vamos começar",
          onClick: hasProgress ? resume : next,
          secondary: hasProgress ? (
            <div className="ob-secondary">
              <button type="button" className="ob-link" onClick={resetAll}>
                Começar de novo
              </button>
            </div>
          ) : undefined,
        };
      case "worries":
        return { label: answers.worries.length ? "Continuar" : "Pular", onClick: next };
      case "usage":
        return { label: answers.usage.length ? "Continuar" : "Pular", onClick: next };
      case "thanks":
        return { label: "Montar meu plano", onClick: next };
      case "compare":
        return { label: "Salvar meu plano", onClick: next };
      case "building":
      case "save":
        return null;
      default:
        return { label: "Continuar", onClick: next };
    }
  })();

  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const people = answers.people ?? defaultPeople(answers.moment);
  const rooms = answers.rooms ?? defaultRooms(answers.housing, answers.people);
  const stateValue = answers.state ?? guessState();
  const info = stateInfo(stateValue);

  const view = (() => {
    switch (step) {
      case "welcome":
        return <WelcomeStep reduced={reduced} />;

      case "name":
        return (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canContinue) next();
            }}
          >
            <h1 className="ob-title" id="ob-name-title" tabIndex={-1}>
              Como podemos te chamar?
            </h1>
            <input
              className="ob-input"
              data-autofocus
              aria-labelledby="ob-name-title"
              value={answers.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Seu nome"
              autoComplete="given-name"
              enterKeyHint="next"
              maxLength={40}
            />
          </form>
        );

      case "greet":
        return (
          <div className="ob-center">
            <Ring reduced={reduced}>
              <motion.img
                src="/brand/larume-symbol.webp"
                alt=""
                width={512}
                height={512}
                className="ob-ring-mark"
                animate={reduced ? undefined : { rotate: [0, -8, 7, -4, 0] }}
                transition={{ duration: 1.4, delay: 0.5, ease: "easeInOut" }}
              />
            </Ring>
            <h1 className="ob-title ob-title-center" tabIndex={-1}>
              Prazer em te conhecer, {first}!
            </h1>
            <p className="ob-sub ob-sub-center">
              São poucas perguntas, e cada resposta muda o seu plano.
            </p>
          </div>
        );

      case "moment":
        return (
          <>
            <h1 className="ob-title" tabIndex={-1}>
              Qual é o momento da sua casa nova?
            </h1>
            <RadioOptions
              legend="Momento da casa nova"
              name="moment"
              value={answers.moment}
              options={MOMENTS}
              onChange={(moment) =>
                set({
                  moment,
                  people: answers.people ?? defaultPeople(moment),
                })
              }
              reduced={reduced}
            />
          </>
        );

      case "date":
        return (
          <DateStep
            answers={answers}
            set={set}
            reduced={reduced}
          />
        );

      case "timeline":
        return (
          <TimelineStep
            weeks={weeksUntil(answers.moveDate ?? "")}
            first={first}
            reduced={reduced}
          />
        );

      case "state":
        return (
          <StateStep value={stateValue} onChange={(state) => set({ state })} />
        );

      case "climate":
        return <ClimateStep info={info} reduced={reduced} />;

      case "housing":
        return (
          <>
            <h1 className="ob-title" tabIndex={-1}>
              Como é a sua casa nova?
            </h1>
            <RadioOptions
              legend="Tipo de moradia"
              name="housing"
              value={answers.housing}
              options={HOUSINGS}
              onChange={(housing) => set({ housing, rooms: null })}
              reduced={reduced}
            />
          </>
        );

      case "people":
        return (
          <PeopleStep
            people={people}
            onChange={(value) => set({ people: value })}
            reduced={reduced}
          />
        );

      case "rooms":
        return (
          <RoomsStep
            answers={answers}
            rooms={rooms}
            onToggle={(room) => set({ rooms: toggle(rooms, room) })}
            reduced={reduced}
          />
        );

      case "owned":
        return (
          <>
            <h1 className="ob-title" tabIndex={-1}>
              Você já tem alguma coisa?
            </h1>
            <RadioOptions
              legend="O que você já tem"
              name="owned"
              value={answers.owned}
              options={OWNED}
              onChange={(owned) => set({ owned })}
              reduced={reduced}
            />
          </>
        );

      case "style":
        return (
          <StyleStep
            answers={answers}
            onChange={(style) => set({ style })}
            reduced={reduced}
          />
        );

      case "budget":
        return (
          <>
            <h1 className="ob-title" tabIndex={-1}>
              Quanto você pretende investir?
            </h1>
            <p className="ob-sub">
              Uma ideia basta, você ajusta depois. Fica neste aparelho até você criar a conta; depois, guardamos na sua conta para dimensionar o plano.
            </p>
            <RadioOptions
              legend="Orçamento"
              name="budget"
              value={answers.budget}
              options={BUDGETS}
              onChange={(budget) => set({ budget })}
              reduced={reduced}
            />
          </>
        );

      case "worries":
        return (
          <>
            <h1 className="ob-title" tabIndex={-1}>
              O que mais te preocupa?
            </h1>
            <p className="ob-sub">Pode marcar mais de uma.</p>
            <CheckOptions
              legend="Preocupações"
              name="worries"
              values={answers.worries}
              options={WORRIES}
              onToggle={(w) => set({ worries: toggle(answers.worries, w) })}
              reduced={reduced}
            />
          </>
        );

      case "usage":
        return (
          <>
            <h1 className="ob-title" tabIndex={-1}>
              Como você quer usar a Larume?
            </h1>
            <p className="ob-sub">Pode escolher mais de uma opção.</p>
            <CheckOptions
              legend="Como usar"
              name="usage"
              values={answers.usage}
              options={USAGES}
              onToggle={(u) => set({ usage: toggle(answers.usage, u) })}
              reduced={reduced}
            />
          </>
        );

      case "thanks":
        return (
          <div className="ob-center">
            <Ring reduced={reduced}>
              <Heart size={54} strokeWidth={1.3} />
            </Ring>
            <h1 className="ob-title ob-title-center" tabIndex={-1}>
              {first}, {THANKS[answers.moment ?? "casal"]}
            </h1>
            <motion.div
              className="ob-note"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4, ease: EASE }}
            >
              <span className="ob-note-icon">
                <Sparkles size={16} />
              </span>
              <strong>Um plano só seu</strong>
              <span>Eu cuido das quantidades, do clima e das prioridades.</span>
            </motion.div>
          </div>
        );

      case "building":
        return (
          <BuildingStep
            plan={plan}
            first={first}
            loc={info.loc}
            people={people}
            hasDate={answers.moveDate !== null}
            reduced={reduced}
            onDone={next}
          />
        );

      case "ready":
        return (
          <ReadyStep
            answers={answers}
            plan={plan}
            first={first}
            reduced={reduced}
          />
        );

      case "savings":
        return <SavingsStep answers={answers} loc={info.loc} reduced={reduced} />;

      case "firstnight":
        return <FirstNightStep plan={plan} first={first} reduced={reduced} />;

      case "schedule":
        return (
          <ScheduleStep plan={plan} moveDate={answers.moveDate} reduced={reduced} />
        );

      case "compare":
        return (
          <CompareStep
            answers={answers}
            plan={plan}
            first={first}
            loc={info.loc}
            people={people}
            reduced={reduced}
          />
        );

      case "save":
        return (
          <SaveStep
            answers={answers}
            plan={plan}
            first={first}
            reduced={reduced}
          />
        );
    }
  })();

  if (gate === "checking") {
    return (
      <div className="ob ob-gate" aria-busy="true">
        <Brand />
      </div>
    );
  }

  return (
    <div className="ob" data-step={step}>
      <aside className="ob-aside">
        <img src="/images/larume-home.webp" alt="" />
        <a href="/" className="brand-link ob-aside-brand">
          <Brand light />
        </a>
        <p className="ob-aside-quote">
          O melhor de uma casa é o que você <em>vai viver nela.</em>
        </p>
      </aside>

      <div className="ob-col">
        <header className="ob-top">
          {step === "welcome" ? (
            <a className="ob-back" href="/" aria-label="Voltar ao início">
              <ArrowLeft size={20} />
            </a>
          ) : (
            <button
              type="button"
              className="ob-back"
              onClick={prev}
              aria-label="Voltar"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div
            className="ob-progress"
            role="progressbar"
            aria-label="Progresso do seu plano"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            data-hidden={hideProgress}
          >
            <motion.span
              className="ob-progress-fill"
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 140, damping: 24 }
              }
            />
          </div>
        </header>

        <main className="ob-main" id="ob-main">
          <AnimatePresence mode="wait" initial={false} custom={{ dir, reduced }}>
            <motion.section
              key={step}
              className="ob-section"
              custom={{ dir, reduced }}
              variants={sectionVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <Shown onShown={onShown} />
              {view}
            </motion.section>
          </AnimatePresence>
        </main>

        {footer && (
          <footer className="ob-footer">
            <CtaButton
              label={footer.label}
              disabled={!canContinue}
              onClick={footer.onClick}
              reduced={reduced}
            />
            {footer.secondary}
          </footer>
        )}
      </div>
    </div>
  );
}

function Shown({ onShown }: { onShown: () => void }) {
  useEffect(() => {
    onShown();
    // Roda uma vez, quando a tela termina de entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function CtaButton({
  label,
  disabled,
  onClick,
  reduced,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  reduced: boolean;
}) {
  const previous = useRef(disabled);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (previous.current && !disabled && !reduced) setPulse((n) => n + 1);
    previous.current = disabled;
  }, [disabled, reduced]);
  return (
    <motion.button
      key={pulse}
      type="button"
      className="ob-cta"
      disabled={disabled}
      onClick={onClick}
      initial={pulse > 0 ? { scale: 0.97 } : false}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 14 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.98 }}
    >
      {label}
      <ArrowRight size={18} />
    </motion.button>
  );
}

/* ---------------------------------------------------------- boas-vindas */

const PREVIEW_ITEMS = [
  "Jogo de panelas",
  "Cortina blackout",
  "Ventilador de teto",
  "Máquina de lavar roupa",
];

function WelcomeStep({ reduced }: { reduced: boolean }) {
  const [done, setDone] = useState(reduced ? 3 : 0);
  useEffect(() => {
    if (reduced) return;
    const timers = [1000, 1700, 2400].map((ms, i) =>
      window.setTimeout(() => setDone(i + 1), ms),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [reduced]);

  return (
    <div className="ob-welcome">
      <div className="ob-guide">
        <motion.div
          className="ob-bubble"
          initial={reduced ? false : { opacity: 0, scale: 0.85, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.3 }}
        >
          Oi! Boas-vindas à Larume.
        </motion.div>
        <motion.img
          src="/brand/larume-symbol.webp"
          alt=""
          width={512}
          height={512}
          className="ob-mark"
          animate={reduced ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="ob-preview" aria-hidden="true">
        <Confetti key={done === 3 ? "go" : "wait"} reduced={reduced || done < 3} />
        {PREVIEW_ITEMS.map((item, i) => {
          const checked = i < done;
          return (
            <div className="ob-preview-row" key={item} data-checked={checked}>
              <span className="ob-preview-check">
                <motion.span
                  initial={false}
                  animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 20 }}
                >
                  <Check size={13} strokeWidth={3} />
                </motion.span>
              </span>
              <span>{item}</span>
            </div>
          );
        })}
      </div>

      <h1 className="ob-title ob-title-center" tabIndex={-1}>
        Seu enxoval de casa nova, <em>personalizado</em> e <em>sem exageros</em>
      </h1>
      <p className="ob-sub ob-sub-center">
        Responda a algumas perguntas rápidas e eu monto o plano do seu lar.
        Cerca de 2 minutos, sem e-mail por enquanto.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- data */

function DateStep({
  answers,
  set,
  reduced,
}: {
  answers: Answers;
  set: (patch: Partial<Answers>) => void;
  reduced: boolean;
}) {
  const today = new Date();
  const shortcuts = [
    { label: "Em 1 mês", iso: addMonthsISO(today, 1) },
    { label: "Em 3 meses", iso: addMonthsISO(today, 3) },
    { label: "Em 6 meses", iso: addMonthsISO(today, 6) },
  ];
  const unsure = answers.moveDateAnswered && answers.moveDate === null;
  return (
    <>
      <h1 className="ob-title" tabIndex={-1}>
        Quando você vai se mudar?
      </h1>
      <p className="ob-sub">
        Pode ser uma data aproximada. Isso me ajuda a definir as prioridades.
      </p>
      <div className="ob-chips" role="group" aria-label="Atalhos de data">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            className="ob-chip"
            aria-pressed={answers.moveDate === s.iso}
            onClick={() => set({ moveDate: s.iso, moveDateAnswered: true })}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="ob-chip"
          aria-pressed={unsure}
          onClick={() => set({ moveDate: null, moveDateAnswered: true })}
        >
          Ainda não sei
        </button>
      </div>
      <CalendarPicker
        value={answers.moveDate}
        reduced={reduced}
        onSelect={(iso) => set({ moveDate: iso, moveDateAnswered: true })}
      />
      <div className="ob-date-summary" aria-live="polite">
        <span>Mudança prevista</span>
        <strong>
          {answers.moveDate
            ? formatLongDate(answers.moveDate)
            : unsure
              ? "Sem data por enquanto"
              : "Escolha uma data ou um atalho"}
        </strong>
      </div>
    </>
  );
}

const PHASES: { id: Phase; label: string }[] = [
  { id: "plan", label: "Planejar" },
  { id: "buy", label: "Comprar" },
  { id: "final", label: "Reta final" },
];

function TimelineStep({
  weeks,
  first,
  reduced,
}: {
  weeks: number;
  first: string;
  reduced: boolean;
}) {
  const phase = phaseOf(weeks);
  const position = phase === "plan" ? 17 : phase === "buy" ? 50 : 83;
  const copy: Record<Phase, { title: string; text: string }> = {
    plan: {
      title: `Boa notícia, ${first}!`,
      text: `Faltam cerca de ${weeks} semanas. Dá tempo de pesquisar, comparar preços e comprar com calma.`,
    },
    buy: {
      title: `Tempo bom, ${first}.`,
      text: `Faltam cerca de ${weeks} semanas. Dá para comprar sem correria, começando pelo que pesa mais no bolso.`,
    },
    final: {
      title: `Reta final, ${first}.`,
      text: `Falta${weeks === 1 ? "" : "m"} ${plural(weeks, "semana", "semanas")}. Vamos priorizar o que você precisa na primeira noite.`,
    },
    now: {
      title: `É agora, ${first}.`,
      text: "A mudança é nesta semana. Primeiro o essencial: dormir, tomar banho e cozinhar.",
    },
  };
  return (
    <div className="ob-center ob-timeline">
      <span className="ob-eyebrow">
        {weeks > 0 ? (weeks === 1 ? "SEMANA" : "SEMANAS") : "A MUDANÇA É"}
      </span>
      <div className="ob-bignumber" aria-label={weeks > 0 ? plural(weeks, "semana", "semanas") : "Esta semana"}>
        {weeks > 0 ? <CountUp to={weeks} reduced={reduced} /> : <span className="ob-bignumber-text">Esta semana</span>}
      </div>
      <span className="ob-pill">
        <i /> {PHASES.find((p) => p.id === (phase === "now" ? "final" : phase))?.label}
      </span>
      <h1 className="ob-title ob-title-center" tabIndex={-1}>
        {copy[phase].title}
      </h1>
      <p className="ob-sub ob-sub-center">{copy[phase].text}</p>
      <div className="ob-track" aria-hidden="true">
        <div className="ob-track-bar">
          <motion.span
            className="ob-track-fill"
            initial={reduced ? false : { width: "0%" }}
            animate={{ width: `${position}%` }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
          />
          <motion.span
            className="ob-track-marker"
            initial={reduced ? false : { left: "0%" }}
            animate={{ left: `${position}%` }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
          >
            <span className="ob-track-tip">Você está aqui</span>
          </motion.span>
        </div>
        <div className="ob-track-labels">
          {PHASES.map((p) => (
            <span key={p.id}>{p.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- estado */

function StateStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (uf: string) => void;
}) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "ok" | "outside" | "denied" | "unavailable"
  >("idle");
  const [detected, setDetected] = useState<string | null>(null);

  const detect = async () => {
    setStatus("loading");
    const result = await detectStateFromDevice();
    if (result.status === "ok") {
      setDetected(result.uf);
      onChange(result.uf);
    }
    setStatus(result.status);
  };

  const message =
    status === "ok" && detected === value
      ? `Detectamos ${stateInfo(value).name} pela sua localização. Se não for aí, é só puxar a lista.`
      : status === "outside"
        ? "Parece que você está fora do Brasil. Escolha o estado na lista."
        : status === "denied"
          ? "Sem acesso à localização. Tudo bem: escolha o estado na lista."
          : status === "unavailable"
            ? "Não deu para descobrir a localização agora. Escolha na lista."
            : "Usamos só para escolher o estado. Não guardamos a sua posição, só o estado.";

  return (
    <>
      <h1 className="ob-title" tabIndex={-1}>
        Em qual estado fica a sua casa nova?
      </h1>
      <p className="ob-sub">
        Assim eu ajusto as peças ao clima de onde você vai morar.
      </p>
      <button
        type="button"
        className="ob-locate"
        onClick={detect}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : (
          <MapPin size={17} />
        )}
        {status === "loading" ? "Buscando…" : "Usar minha localização"}
      </button>
      <p className="ob-locate-note" role="status">
        {message}
      </p>
      <WheelPicker
        label="Estado"
        value={value}
        options={STATES.map((s) => ({ value: s.uf, label: s.name }))}
        onChange={onChange}
      />
    </>
  );
}

/* --------------------------------------------------------------- clima */

function ClimateStep({
  info,
  reduced,
}: {
  info: ReturnType<typeof stateInfo>;
  reduced: boolean;
}) {
  const copy = {
    hot: {
      Icon: Sun,
      title: "Sua casa nova vai ser quente",
      text: `Faz calor quase o ano todo ${info.loc}. Vou priorizar ventilação e roupa de cama leve, e deixar os cobertores pesados de fora.`,
    },
    mild: {
      Icon: CloudSun,
      title: "Seu clima tem de tudo um pouco",
      text: `O clima ${info.loc} muda ao longo do ano: calor no verão e noites frescas no inverno. Vou equilibrar peças leves com uma camada extra.`,
    },
    cold: {
      Icon: Snowflake,
      title: "O inverno pede cobertor",
      text: `${capitalize(info.loc)} o inverno é de verdade. Vou incluir edredom, cobertores e tapetes, e deixar o ar-condicionado como opcional.`,
    },
  }[info.climate];
  return (
    <div className="ob-center">
      <Ring reduced={reduced}>
        <copy.Icon size={56} strokeWidth={1.3} />
      </Ring>
      <h1 className="ob-title ob-title-center" tabIndex={-1}>
        {copy.title}
      </h1>
      <p className="ob-sub ob-sub-center">{copy.text}</p>
      <motion.ul
        className="ob-seasons"
        initial={reduced ? false : "hidden"}
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } }}
      >
        {SEASON_NAMES.map((season, i) => {
          const tone = SEASONS[info.climate][i];
          return (
            <motion.li key={season} variants={reduced ? undefined : itemVariants}>
              <span>{season}</span>
              <b data-tone={tone}>{TONE_LABEL[tone]}</b>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}

/* ------------------------------------------------------------- pessoas */

const PEOPLE_CAPTION = ["só eu", "duas", "três", "quatro", "cinco ou mais"];

function PeopleStep({
  people,
  onChange,
  reduced,
}: {
  people: number;
  onChange: (value: number) => void;
  reduced: boolean;
}) {
  return (
    <>
      <h1 className="ob-title" tabIndex={-1}>
        Quantas pessoas vão morar aí?
      </h1>
      <p className="ob-sub">
        Isso define quantas peças de cada item eu vou sugerir.
      </p>
      <fieldset className="ob-fieldset">
        <legend className="ob-sr">Número de moradores</legend>
        <Stagger className="ob-people" reduced={reduced}>
          {[1, 2, 3, 4, 5].map((n) => (
            <motion.label
              key={n}
              className="ob-person"
              data-selected={people === n}
              variants={reduced ? undefined : itemVariants}
              whileTap={reduced ? undefined : { scale: 0.96 }}
            >
              <input
                type="radio"
                name="people"
                value={n}
                checked={people === n}
                onChange={() => onChange(n)}
                aria-label={n === 5 ? "5 ou mais pessoas" : plural(n, "pessoa", "pessoas")}
              />
              <strong>{n === 5 ? "5+" : n}</strong>
              <small>{PEOPLE_CAPTION[n - 1]}</small>
            </motion.label>
          ))}
        </Stagger>
      </fieldset>
      <p className="ob-live" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={people}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
          >
            Vou sugerir pratos, copos e toalhas para{" "}
            <strong>{people === 5 ? "5 ou mais pessoas" : plural(people, "pessoa", "pessoas")}</strong>.
          </motion.span>
        </AnimatePresence>
      </p>
    </>
  );
}

/* ------------------------------------------------------------ ambientes */

function RoomsStep({
  answers,
  rooms,
  onToggle,
  reduced,
}: {
  answers: Answers;
  rooms: OptionalRoom[];
  onToggle: (room: OptionalRoom) => void;
  reduced: boolean;
}) {
  const housing = answers.housing;
  const studio = housing === "studio";
  const counts = useMemo(() => roomItemCounts(answers), [answers]);
  const total = useMemo(
    () => generatePlan({ ...answers, rooms }).stats.total,
    [answers, rooms],
  );
  const base: Option<OptionalRoom>[] = [
    { value: "cozinha", label: "Cozinha", hint: "Com os eletrodomésticos", icon: <CookingPot size={20} /> },
    { value: "banheiro", label: "Banheiro", icon: <Bath size={20} /> },
    ...(studio
      ? ([
          { value: "sala", label: "Sala e quarto", hint: "Integrados, como no studio", icon: <Sofa size={20} /> },
        ] as Option<OptionalRoom>[])
      : ([
          { value: "sala", label: "Sala de estar", icon: <Sofa size={20} /> },
          { value: "quarto", label: "Quarto principal", icon: <BedDouble size={20} /> },
          { value: "quartoExtra", label: "Quarto extra ou de visitas", icon: <Armchair size={20} /> },
        ] as Option<OptionalRoom>[])),
    { value: "servico", label: "Área de serviço", icon: <WashingMachine size={20} /> },
    {
      value: "externa",
      label: housing === "casa" ? "Quintal ou área externa" : "Varanda",
      icon: housing === "casa" ? <Trees size={20} /> : <Flower2 size={20} />,
    },
    { value: "escritorio", label: "Home office", icon: <Laptop size={20} /> },
  ];
  const options = base.map((option) => ({
    ...option,
    meta: counts[option.value] ? plural(counts[option.value]!, "item", "itens") : undefined,
  }));
  return (
    <>
      <h1 className="ob-title" tabIndex={-1}>
        Quais espaços você quer equipar?
      </h1>
      <p className="ob-sub">
        Marque o que entra no plano. O número mostra quantos itens cada espaço tem.
      </p>
      <CheckOptions
        legend="Espaços da casa"
        name="rooms"
        values={rooms}
        options={options}
        onToggle={onToggle}
        reduced={reduced}
      />
      <p className="ob-live" aria-live="polite">
        {rooms.length === 0 ? (
          "Marque pelo menos um espaço para continuar."
        ) : (
          <>
            Com essas escolhas, seu plano tem{" "}
            <strong>{plural(total, "item", "itens")}</strong>.
          </>
        )}
      </p>
    </>
  );
}

/* --------------------------------------------------------------- estilo */

function StyleStep({
  answers,
  onChange,
  reduced,
}: {
  answers: Answers;
  onChange: (style: PlanStyle) => void;
  reduced: boolean;
}) {
  const stats = generatePlan({ ...answers, style: "full" }).stats;
  const options: Option<PlanStyle>[] = [
    {
      value: "full",
      label: "Completo, sem faltar nada",
      hint: "Tudo o que sua casa pode precisar",
      icon: <ClipboardCheck size={20} />,
      meta: `${stats.complete} itens`,
    },
    {
      value: "min",
      label: "Minimalista, só o necessário",
      hint: "O básico para morar bem",
      icon: <Leaf size={20} />,
      meta: `${stats.essentials} itens`,
    },
  ];
  return (
    <>
      <h1 className="ob-title" tabIndex={-1}>
        Como você quer montar o enxoval?
      </h1>
      <p className="ob-sub">A contagem já considera as suas respostas.</p>
      <RadioOptions
        legend="Estilo do enxoval"
        name="style"
        value={answers.style}
        options={options}
        onChange={onChange}
        reduced={reduced}
      />
    </>
  );
}

/* ------------------------------------------------------------- montando */

function BuildingStep({
  plan,
  first,
  loc,
  people,
  hasDate,
  reduced,
  onDone,
}: {
  plan: GeneratedPlan;
  first: string;
  loc: string;
  people: number;
  hasDate: boolean;
  reduced: boolean;
  onDone: () => void;
}) {
  const [pct, setPct] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let timer: number | undefined;
    const controls = animate(0, 100, {
      duration: reduced ? 1.2 : 4.2,
      ease: "easeInOut",
      onUpdate: (value) => setPct(Math.round(value)),
      onComplete: () => {
        timer = window.setTimeout(() => doneRef.current(), reduced ? 250 : 650);
      },
    });
    return () => {
      controls.stop();
      if (timer) window.clearTimeout(timer);
    };
  }, [reduced]);

  const checklist = [
    `${plural(plan.stats.total, "item", "itens")} em ${plural(plan.stats.rooms, "ambiente", "ambientes")}`,
    `Quantidades para ${plural(people, "pessoa", "pessoas")}`,
    "Prioridade para a primeira noite",
    `Ajuste ao clima ${loc}`,
    ...(hasDate ? ["Prazo até a mudança"] : []),
  ];
  const step = 100 / (checklist.length + 0.5);

  return (
    <div className="ob-center ob-building">
      <motion.img
        src="/brand/larume-symbol.webp"
        alt=""
        width={512}
        height={512}
        className="ob-mark ob-mark-sm"
        animate={reduced ? undefined : { rotate: [0, -5, 5, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="ob-bignumber ob-bignumber-md" aria-hidden="true">
        {pct}%
      </div>
      <h1 className="ob-title ob-title-center" tabIndex={-1} role="status">
        Montando o plano de {first}
      </h1>
      <p className="ob-sub ob-sub-center">Ajustando as peças ao clima {loc}.</p>
      <div className="ob-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <ul className="ob-checklist">
        {checklist.map((text, i) => {
          const checked = pct >= Math.round(step * (i + 1));
          return (
            <li key={text} data-checked={checked}>
              <span className="ob-checklist-dot">
                <motion.span
                  initial={false}
                  animate={{ scale: checked ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 20 }}
                >
                  <Check size={13} strokeWidth={3} />
                </motion.span>
              </span>
              {text}
            </li>
          );
        })}
      </ul>
      <p className="ob-hint">Isso leva só alguns segundos</p>
    </div>
  );
}

/* ---------------------------------------------------------------- pronto */

function ReadyStep({
  answers,
  plan,
  first,
  reduced,
}: {
  answers: Answers;
  plan: GeneratedPlan;
  first: string;
  reduced: boolean;
}) {
  const { stats } = plan;
  const fit = {
    within: "Cabe no seu orçamento, com folga para imprevistos.",
    tight: "Fica perto do seu limite. Comece pelos essenciais.",
    over:
      stats.bigTicketDeferred > 0
        ? `Passa do orçamento. Deixei ${plural(stats.bigTicketDeferred, "compra grande", "compras grandes")} para depois. O que fica para agora é ≈ ${formatEstimate(stats.estimateNowMinCents, stats.estimateNowMaxCents)}.`
        : "Passa do orçamento. O estilo minimalista ajuda a aliviar.",
    unknown: "Ajuste com os preços que você for encontrando.",
  }[stats.budgetFit];

  const steps = [
    answers.owned === "nada"
      ? { t: "Comece pelo quarto e pelo banheiro", d: "É o que você precisa na primeira noite." }
      : { t: "Marque o que você já tem", d: "Assim a lista mostra só o que falta." },
    answers.usage.includes("spend") || answers.budget !== "unknown"
      ? { t: "Anote os preços que encontrar", d: "A Larume soma o que você já gastou." }
      : { t: "Escolha o que fica para depois", d: "O que é opcional pode esperar a mudança." },
    answers.usage.includes("share")
      ? { t: "Convide quem mora com você", d: "Vocês acompanham a mesma lista." }
      : answers.usage.includes("links")
        ? { t: "Salve os links dos produtos", d: "Cada item guarda o link e o preço." }
        : { t: "Ajuste a lista ao seu jeito", d: "Renomeie, reordene e acrescente itens." },
  ];

  return (
    <>
      <div className="ob-ready-head">
        <Ring reduced={reduced} size="md">
          <ClipboardCheck size={34} strokeWidth={1.4} />
        </Ring>
        <h1 className="ob-title ob-title-center" tabIndex={-1}>
          O plano de <em>{first}</em> está pronto
        </h1>
      </div>

      <div className="ob-metrics">
        <div data-chosen={answers.style === "min"}>
          <CountUp to={stats.essentials} reduced={reduced} className="ob-metric-n" />
          <span>essenciais</span>
        </div>
        <div data-chosen={answers.style !== "min"}>
          <CountUp to={stats.complete} reduced={reduced} className="ob-metric-n" />
          <span>no plano completo</span>
        </div>
      </div>
      <p className="ob-chosen">
        Seu plano: <strong>{plural(stats.total, "item", "itens")}</strong> em{" "}
        {plural(stats.rooms, "ambiente", "ambientes")}
      </p>

      <h2 className="ob-label">Montado com as suas respostas</h2>
      <Stagger className="ob-rooms" reduced={reduced}>
        {plan.categories.map((category, i) => {
          const Icon = ROOM_ICONS[category.key as RoomKey] ?? Sofa;
          const firstNight =
            i === 0 || (category.key === "banheiro" && plan.categories[0]?.key === "quarto");
          return (
            <motion.div
              className="ob-room"
              key={category.key}
              variants={reduced ? undefined : itemVariants}
            >
              <span className="ob-room-icon">
                <Icon size={20} />
              </span>
              <strong>{category.name}</strong>
              <small>{plural(category.items.length, "item", "itens")}</small>
              {firstNight && <em>primeira noite</em>}
            </motion.div>
          );
        })}
      </Stagger>

      <div className="ob-estimate">
        <span className="ob-label ob-label-tight">Referência de investimento</span>
        <strong>
          ≈ {formatEstimate(stats.estimateMinCents, stats.estimateMaxCents)}
        </strong>
        <p>{fit}</p>
        <small>Faixa aproximada. Os valores reais são os que você anotar.</small>
      </div>

      <h2 className="ob-label">Seus primeiros passos</h2>
      <ol className="ob-steps">
        {steps.map((s, i) => (
          <li key={s.t}>
            <b>{i + 1}</b>
            <span>
              <strong>{s.t}</strong>
              <small>{s.d}</small>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/* -------------------------------------------------------- valor: economia */

const REASON_LABEL: Record<
  ExcludeReason,
  (context: { loc: string; housing: Housing | null }) => string
> = {
  rooms: () => "Espaços que você não vai equipar",
  housing: ({ housing }) =>
    `Não servem para ${housing === "casa" ? "uma casa" : housing === "studio" ? "um studio" : "um apartamento"}`,
  climate: ({ loc }) => `Peças de frio que o clima ${loc} dispensa`,
  region: () => "Itens típicos de outra região",
  moment: () => "Itens de outro momento de vida",
  style: () => "Opcionais que o estilo minimalista dispensa",
};

function SavingsStep({
  answers,
  loc,
  reduced,
}: {
  answers: Answers;
  loc: string;
  reduced: boolean;
}) {
  const sv = useMemo(() => savingsFor(answers), [answers]);
  const ratio = sv.genericTotal ? sv.planTotal / sv.genericTotal : 1;
  const savedMin = Math.max(sv.genericMinCents - sv.planMinCents, 0);
  const savedMax = Math.max(sv.genericMaxCents - sv.planMaxCents, 0);
  const none = sv.removedCount === 0;
  const title = none
    ? "Sua lista já está no tamanho certo"
    : `${plural(sv.removedCount, "item", "itens")} que você não precisa comprar`;
  return (
    <>
      <span className="ob-eyebrow ob-eyebrow-left">COMPARADO A UMA LISTA GENÉRICA</span>
      <h1 className="ob-title" tabIndex={-1} aria-label={title}>
        {none ? (
          title
        ) : (
          <span aria-hidden="true">
            <CountUp to={sv.removedCount} reduced={reduced} />{" "}
            {sv.removedCount === 1 ? "item" : "itens"} que você não precisa comprar
          </span>
        )}
      </h1>
      <p className="ob-sub">
        Uma lista genérica manda comprar tudo, para qualquer casa. A sua foi
        ajustada às suas respostas.
      </p>

      <div className="ob-bars">
        <div className="ob-bar-row">
          <div className="ob-bar-label">
            <span>Lista genérica</span>
            <strong>{plural(sv.genericTotal, "item", "itens")}</strong>
          </div>
          <div className="ob-bar-track">
            <motion.span
              className="ob-bar-fill ob-bar-generic"
              initial={reduced ? false : { width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
            />
          </div>
          <small>≈ {formatEstimate(sv.genericMinCents, sv.genericMaxCents)}</small>
        </div>
        <div className="ob-bar-row">
          <div className="ob-bar-label">
            <span>O plano de {firstName(answers.name)}</span>
            <strong>{plural(sv.planTotal, "item", "itens")}</strong>
          </div>
          <div className="ob-bar-track">
            <motion.span
              className="ob-bar-fill ob-bar-plan"
              initial={reduced ? false : { width: 0 }}
              animate={{ width: `${Math.max(ratio * 100, 4)}%` }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.45 }}
            />
          </div>
          <small>≈ {formatEstimate(sv.planMinCents, sv.planMaxCents)}</small>
        </div>
      </div>

      {savedMax > 0 && (
        <div className="ob-callout">
          <TrendingDown size={20} />
          <span>
            Cerca de <strong>{formatEstimate(savedMin, savedMax)}</strong> de
            referência que você não gasta com itens que não servem para a sua casa.
          </span>
        </div>
      )}

      {sv.reasons.length > 0 && (
        <>
          <h2 className="ob-label">O que ficou de fora e por quê</h2>
          <Stagger className="ob-reasons" reduced={reduced}>
            {sv.reasons.slice(0, 4).map((reason) => (
              <motion.div
                key={reason.reason}
                className="ob-reason"
                variants={reduced ? undefined : itemVariants}
              >
                <div>
                  <strong>
                    {REASON_LABEL[reason.reason]({ loc, housing: answers.housing })}
                  </strong>
                  <span>{plural(reason.count, "item", "itens")}</span>
                </div>
                <p>{reason.examples.join(", ")}</p>
              </motion.div>
            ))}
          </Stagger>
        </>
      )}
      <p className="ob-fine">
        Valores de referência. Os preços reais são os que você anotar.
      </p>
    </>
  );
}

/* ------------------------------------------------ valor: primeira noite */

function FirstNightStep({
  plan,
  first,
  reduced,
}: {
  plan: GeneratedPlan;
  first: string;
  reduced: boolean;
}) {
  const items = firstNightItems(plan);
  const groups = [...new Set(items.map((item) => item.category))].map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  }));
  return (
    <>
      <div className="ob-ready-head">
        <Ring reduced={reduced} size="md">
          <Moon size={34} strokeWidth={1.4} />
        </Ring>
        <h1 className="ob-title ob-title-center" tabIndex={-1}>
          A primeira noite de {first}, resolvida
        </h1>
        <p className="ob-sub ob-sub-center">
          Estes {plural(items.length, "item", "itens")} deixam a casa pronta para
          dormir, tomar banho e comer no dia da mudança. Compre estes primeiro; o
          resto pode esperar.
        </p>
      </div>
      <Stagger className="ob-night" reduced={reduced}>
        {groups.map((group) => (
          <motion.section
            key={group.category}
            className="ob-night-group"
            variants={reduced ? undefined : itemVariants}
          >
            <h2>{group.category}</h2>
            <ul>
              {group.items.map((item) => {
                const quantity = item.description.match(/(\d+) un\./)?.[0];
                return (
                  <li key={item.name}>
                    <span className="ob-night-check">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span>
                      {item.name}
                      {quantity && <small> · {quantity}</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        ))}
      </Stagger>
    </>
  );
}

/* ----------------------------------------------- valor: cronograma */

const MILESTONE_COPY: Record<Milestone["id"], { title: string; tip: string }> = {
  big: {
    title: "Móveis e eletros grandes",
    tip: "Pesquise preço e prazo de entrega: são os que mais pesam no bolso e demoram a chegar.",
  },
  mid: {
    title: "Itens de valor médio",
    tip: "Dá para comparar preços com calma e aproveitar promoções.",
  },
  small: {
    title: "O restante do essencial",
    tip: "Itens baratos do dia a dia. Dá para resolver em uma ida só.",
  },
  night: {
    title: "Kit da primeira noite",
    tip: "Deixe separado e à mão: será a primeira coisa que você vai usar.",
  },
  after: {
    title: "Depois de morar",
    tip: "Opcionais e detalhes. Morando lá, você descobre o que realmente falta.",
  },
};

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

function ScheduleStep({
  plan,
  moveDate,
  reduced,
}: {
  plan: GeneratedPlan;
  moveDate: string | null;
  reduced: boolean;
}) {
  const milestones = useMemo(() => scheduleFor(plan, moveDate), [plan, moveDate]);
  const label = (milestone: Milestone) =>
    milestone.id === "after"
      ? "Depois da mudança"
      : milestone.now || !milestone.date
        ? "Agora"
        : `Até ${shortDate.format(parseLocalDate(milestone.date))}`;
  return (
    <>
      <div className="ob-ready-head">
        <Ring reduced={reduced} size="md">
          <CalendarClock size={34} strokeWidth={1.4} />
        </Ring>
        <h1 className="ob-title ob-title-center" tabIndex={-1}>
          Seu cronograma de compras
        </h1>
        {moveDate && (
          <p className="ob-sub ob-sub-center">
            Montado com a data da sua mudança, {formatLongDate(moveDate)}.
          </p>
        )}
      </div>
      <motion.ol
        className="ob-schedule"
        initial={reduced ? false : "hidden"}
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
      >
        {milestones.map((milestone) => (
          <motion.li
            key={milestone.id}
            variants={reduced ? undefined : itemVariants}
            data-now={milestone.now}
          >
            <span className="ob-schedule-dot" aria-hidden="true" />
            <div className="ob-schedule-card">
              <span className="ob-schedule-date">{label(milestone)}</span>
              <div className="ob-schedule-title">
                <strong>{MILESTONE_COPY[milestone.id].title}</strong>
                <span>{plural(milestone.count, "item", "itens")}</span>
              </div>
              <p>{MILESTONE_COPY[milestone.id].tip}</p>
              <small>Ex.: {milestone.examples.join(", ")}</small>
            </div>
          </motion.li>
        ))}
      </motion.ol>
      <p className="ob-fine">
        <PackageCheck size={14} /> Cada compra vira um item que você marca na lista.
      </p>
    </>
  );
}

/* ------------------------------------------------------------ comparação */

function CompareStep({
  answers,
  plan,
  first,
  loc,
  people,
  reduced,
}: {
  answers: Answers;
  plan: GeneratedPlan;
  first: string;
  loc: string;
  people: number;
  reduced: boolean;
}) {
  const pains = (answers.worries.length ? answers.worries : DEFAULT_PAINS)
    .slice(0, 4)
    .map((w) => WORRY_PAIN[w]);
  const gains = [
    `${plural(plan.stats.total, "item", "itens")} pensados para o clima ${loc}`,
    "Ambientes na ordem da primeira noite",
    `Quantidades para ${plural(people, "pessoa", "pessoas")}`,
    "Preço, link e anotação em cada item",
    "Lista compartilhada com quem mora com você",
  ];
  return (
    <>
      <h1 className="ob-title ob-title-center" tabIndex={-1}>
        A diferença de ter um plano
      </h1>
      <div className="ob-compare">
        <motion.div
          className="ob-compare-card ob-compare-without"
          initial={reduced ? false : { opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
        >
          <h2>Sem plano</h2>
          <ul>
            {pains.map((p) => (
              <li key={p}>
                <span aria-hidden="true">−</span> {p}
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div
          className="ob-compare-card ob-compare-with"
          initial={reduced ? false : { opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.2 }}
        >
          <h2>Com o plano de {first}</h2>
          <ul>
            {gains.map((g) => (
              <li key={g}>
                <span aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>{" "}
                {g}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- salvar */

const BENEFITS: { Icon: LucideIcon; text: string }[] = [
  { Icon: ListChecks, text: "Marque o que já comprou e acompanhe o progresso de cada ambiente" },
  { Icon: Wallet, text: "Anote preço e link de cada item e veja quanto já gastou" },
  { Icon: Receipt, text: "Registre descontos e cashback e veja o gasto líquido" },
  { Icon: Share2, text: "Compartilhe a lista com quem mora com você" },
];

function SaveStep({
  answers,
  plan,
  first,
  reduced,
}: {
  answers: Answers;
  plan: GeneratedPlan;
  first: string;
  reduced: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const payload = useMemo(() => toPayload(plan), [plan]);
  // Os mesmos valores que geraram o plano: o servidor exige todas as respostas obrigatórias.
  const profile = {
    ...answers,
    state: answers.state ?? guessState(),
    people: answers.people ?? defaultPeople(answers.moment),
    rooms: answers.rooms ?? defaultRooms(answers.housing, answers.people),
  };

  // Um único pedido cria a conta e o primeiro enxoval, já com o plano. Se falhar,
  // nada é criado pela metade e as respostas continuam guardadas.
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    track("signup_submit");
    try {
      await register(answers.name.trim(), email.trim(), password, {
        enxovalName: plan.enxovalName,
        plan: payload,
        profile,
      });
      clearOnboarding();
      track("signup_success");
      window.location.assign("/app");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a conta agora. Tente novamente.",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="ob-save-head">
        <Ring reduced={reduced} size="md">
          <ShieldCheck size={32} strokeWidth={1.4} />
        </Ring>
        <h1 className="ob-title ob-title-center" tabIndex={-1}>
          Salve o plano de {first}
        </h1>
        <p className="ob-sub ob-sub-center">
          Crie sua conta gratuita para guardar tudo isso e abrir no celular ou
          no computador.
        </p>
        <p className="ob-save-summary">
          <ListChecks size={16} /> {plural(plan.stats.total, "item", "itens")} em{" "}
          {plural(plan.stats.rooms, "ambiente", "ambientes")}
        </p>
      </div>

      <ul className="ob-benefits" aria-label="O que você ganha ao criar a conta">
        {BENEFITS.map(({ Icon, text }) => (
          <li key={text}>
            <span>
              <Icon size={16} />
            </span>
            {text}
          </li>
        ))}
      </ul>

      <form className="ob-form" onSubmit={submit}>
        <label>
          Seu e-mail
          <input
            className="ob-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Crie uma senha
          <span className="ob-password">
            <input
              className="ob-input"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 ou mais caracteres"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button
              type="button"
              aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {error && (
          <div className="ob-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="ob-cta" disabled={submitting}>
          {submitting ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            "Criar conta e salvar plano"
          )}
          {!submitting && <ArrowRight size={18} />}
        </button>
      </form>
      <p className="ob-privacy">
        Ao criar a conta, guardamos as suas respostas (como estado, data da
        mudança e faixa de orçamento) para montar e ajustar o seu plano. Veja como
        tratamos os seus dados na{" "}
        <a href="/privacidade" target="_blank" rel="noopener">
          política de privacidade
        </a>
        .
      </p>

      <p className="ob-trust">
        <ShieldCheck size={15} /> Sem cartão de crédito. Seus dados ficam só com você.
      </p>
    </>
  );
}
