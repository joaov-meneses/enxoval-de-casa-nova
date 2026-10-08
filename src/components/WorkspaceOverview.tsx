import {
  ArrowUpRight,
  Check,
  CircleCheck,
  Coffee,
  BedDouble,
  Bath,
  Sofa,
  WashingMachine,
  Package,
  Wallet,
  Sparkles,
  Users,
  Plus,
  House,
  Heart,
} from "lucide-react";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { ExportMenu } from "./ExportMenu";

export function RoomIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = /cozinha/i.test(name)
    ? Coffee
    : /quarto/i.test(name)
      ? BedDouble
      : /banheiro/i.test(name)
        ? Bath
        : /sala/i.test(name)
          ? Sofa
          : /serviço/i.test(name)
            ? WashingMachine
            : Package;
  return <Icon size={size} strokeWidth={1.6} />;
}
export function WorkspaceOverview({
  items,
  categories,
  name,
  discountCents,
  onCategory,
  onInvite,
  view,
  scope,
}: {
  items: EnxovalItem[];
  categories: EnxovalCategory[];
  name: string;
  discountCents: number;
  onCategory: (id: string) => void;
  onInvite: () => void;
  view: "list" | "overview";
  /** Quando há um ambiente aberto, os cartões resumem só os itens dele. */
  scope?: { name: string; items: EnxovalItem[] };
}) {
  // Descontos e cashback são do enxoval inteiro: não entram na conta de um ambiente.
  const statsItems = scope ? scope.items : items;
  const statsDiscountCents = scope ? 0 : discountCents;
  const done = statsItems.filter((i) => i.checked);
  const spent = Math.max(
    0,
    done.reduce((s, i) => s + (Number(i.priceCents) || 0), 0) -
      statsDiscountCents,
  );
  const pending = statsItems.filter((i) => !i.checked);
  const planned = pending.reduce((s, i) => s + (Number(i.priceCents) || 0), 0);
  const unpriced = pending.filter((i) => !i.priceCents).length;
  const percentage = statsItems.length
    ? Math.round((done.length / statsItems.length) * 100)
    : 0;
  const money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100);
  return (
    <>
      <div className="workspace-welcome">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> UM LAR, UMA CONQUISTA DE CADA VEZ
          </span>
          <h2>
            {view === "overview"
              ? "Seu lar está ganhando forma."
              : "Pequenos detalhes. Grandes começos."}
          </h2>
          <p>
            {view === "overview"
              ? "Um olhar sobre tudo o que vocês já construíram."
              : "Organize os desejos, acompanhe as compras e aproveite o caminho."}
          </p>
        </div>
        {view === "overview" && (
          <ExportMenu
            categories={categories}
            items={items}
            enxovalName={name}
          />
        )}
      </div>
      <p className="stats-scope">
        {scope ? (
          <>
            Resumo de <strong>{scope.name}</strong>
          </>
        ) : view === "overview" ? (
          <>
            Resumo <strong>geral do enxoval</strong>
          </>
        ) : (
          <>
            Resumo <strong>de todos os ambientes</strong>
          </>
        )}
      </p>
      <div className="workspace-stats">
        <article>
          <span className="stat-icon sage">
            <CircleCheck size={20} />
          </span>
          <span className="stat-label">Seu progresso</span>
          <strong>
            {percentage}
            <small>%</small>
          </strong>
          <span className="stat-detail">
            {done.length} de {statsItems.length}{" "}
            {statsItems.length === 1
              ? "item conquistado"
              : "itens conquistados"}
          </span>
          <div className="progress-track">
            <span style={{ width: `${percentage}%` }} />
          </div>
        </article>
        <article>
          <span className="stat-icon sand">
            <Wallet size={20} />
          </span>
          <span className="stat-label">Já investimos</span>
          <strong>{money(spent)}</strong>
          <span className="stat-detail">
            {statsDiscountCents > 0
              ? `${money(statsDiscountCents)} em descontos e cashback`
              : "Soma dos itens comprados"}
          </span>
        </article>
        <article>
          <span className="stat-icon rose">
            <Heart size={20} />
          </span>
          <span className="stat-label">Próximas conquistas</span>
          <strong>{money(planned)}</strong>
          <span className="stat-detail">
            {pending.length}{" "}
            {pending.length === 1 ? "item pendente" : "itens pendentes"}
            {unpriced > 0 ? ` · ${unpriced} sem preço` : ""}
          </span>
        </article>
      </div>
      {view === "overview" && (
        <div className="overview-grid">
          <section className="overview-rooms">
            <div className="panel-title">
              <h3>Cada ambiente, um novo capítulo</h3>
              <House size={20} />
            </div>
            {categories.map((cat) => {
              const all = items.filter((i) => i.categoryId === cat.id);
              const checked = all.filter((i) => i.checked).length;
              return (
                <button
                  key={cat.id}
                  className="overview-room"
                  onClick={() => onCategory(cat.id)}
                >
                  <span className="feature-icon">
                    <RoomIcon name={cat.name} />
                  </span>
                  <span>
                    <strong>{cat.name}</strong>
                    <span className="progress-track">
                      <span
                        style={{
                          width: `${all.length ? (checked / all.length) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </span>
                  <small>
                    {checked}/{all.length}
                  </small>
                  <ArrowUpRight size={17} />
                </button>
              );
            })}
          </section>
          <aside className="overview-next">
            <span className="feature-icon">
              <Users size={23} />
            </span>
            <h3>
              Um lar é feito
              <br />
              para compartilhar.
            </h3>
            <p>
              Traga quem faz parte desse sonho para planejar os próximos passos
              com você.
            </p>
            <button className="button button-dark" onClick={onInvite}>
              Convidar alguém <Plus size={16} />
            </button>
            <div className="next-tip">
              <Sparkles size={16} />
              <p>
                <strong>Um passo de cada vez</strong>Priorize o essencial e
                complete os detalhes no seu ritmo.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
