// Peças do formulário de edição do item: blocos recolhíveis, seletor de situação e dicas sob demanda ("?").
// Só estrutura e acessibilidade; o estado e as regras continuam no ItemRow.
import { useCallback, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "@/src/components/icons";
import { ITEM_STATUSES, ITEM_STATUS_META } from "../itemStatus";
import type { ItemStatus } from "../types";
import "./itemEditForm.css";

/* ------------------------------------------------------------ bloco recolhível */

/**
 * Bloco que abre e fecha. O conteúdo fica sempre no DOM (os campos continuam no estado e vão no envio); fechado, ele
 * recebe `inert`, então não entra na ordem do Tab nem é lido por leitores de tela. O resumo de uma linha aparece só
 * com o bloco fechado.
 */
export function FormBlock({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="item-block" data-open={open || undefined}>
      <h4 className="item-block-heading">
        <button
          type="button"
          id={`${id}-toggle`}
          className="item-block-toggle"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
        >
          <span className="item-block-text">
            <span className="item-block-title">{title}</span>
            {!open && summary ? <span className="item-block-summary">{summary}</span> : null}
          </span>
          <ChevronDown size={18} aria-hidden="true" className="item-block-chevron" />
        </button>
      </h4>
      <div id={`${id}-panel`} className="item-block-panel" inert={!open}>
        <div className="item-block-body">
          <div className="item-block-inner">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ situação */

const STATUS_FAMILY: Record<ItemStatus, "pending" | "done"> = {
  researching: "pending",
  bought: "done",
  received: "done",
  owned: "done",
};

/** Cor da situação (a mesma da lista): azulejo para o que ainda se pesquisa, sálvia para o que já está resolvido. */
export function statusFamily(status: ItemStatus) {
  return STATUS_FAMILY[status] ?? "pending";
}

/**
 * Situação como botões de rádio nativos: setas do teclado trocam a opção, o grupo tem nome e cada opção tem alvo
 * de toque de 44px. A situação escolhida ganha cor, contorno mais grosso e um check, nunca só a cor.
 */
export function StatusSegmented({
  id,
  value,
  onChange,
  disabled,
  tip,
}: {
  id: string;
  value: ItemStatus;
  onChange: (status: ItemStatus) => void;
  disabled?: boolean;
  tip?: ReactNode;
}) {
  return (
    <div className="item-field item-status-field">
      <div className="item-field-head">
        <span id={`${id}-status-label`} className="item-field-label">
          Situação
        </span>
        {tip}
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-status-label`} className="item-status-group">
        {ITEM_STATUSES.map((option) => {
          const selected = option === value;
          return (
            <label
              key={option}
              className="item-status-option"
              data-family={statusFamily(option)}
              data-selected={selected || undefined}
              data-disabled={disabled || undefined}
            >
              <input
                type="radio"
                name={`${id}-status`}
                value={option}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              {selected && <Check size={14} aria-hidden="true" />}
              <span>{ITEM_STATUS_META[option].label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ dicas sob demanda */

/** Quais dicas estão abertas. Ficam fechadas ao abrir o formulário; o texto continua a um toque do "?". */
export function useTips() {
  const [openTips, setOpenTips] = useState<Record<string, boolean>>({});
  const toggle = useCallback((key: string) => setOpenTips((current) => ({ ...current, [key]: !current[key] })), []);
  const closeAll = useCallback(() => setOpenTips((current) => (Object.keys(current).length ? {} : current)), []);
  return { isOpen: (key: string) => Boolean(openTips[key]), toggle, closeAll };
}

/** O "?" ao lado do rótulo. O alvo de toque tem 44px; o desenho, 20px. */
export function TipButton({
  subject,
  open,
  panelId,
  onToggle,
}: {
  subject: string;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="item-tip-button"
      aria-label={`Ajuda: ${subject}`}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}

/** Texto da dica, na largura da linha. Sempre no DOM para o `aria-controls` valer; escondido enquanto fechado. */
export function TipPanel({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <p id={id} className="item-tip-panel" role="note" hidden={!open}>
      {children}
    </p>
  );
}
