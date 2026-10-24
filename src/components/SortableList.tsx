import { Button } from "@/src/components/ui/button";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Reorder, useDragControls } from "motion/react";
import { StaticListIcon } from "./StaticListIcon";

interface Entry {
  id: string;
  name: string;
}
export function SortableList<T extends Entry>({
  items,
  onCommit,
  render,
  label,
  className = "",
  axis = "y",
  disabled = false,
}: {
  items: T[];
  onCommit: (ids: string[]) => Promise<void>;
  render: (item: T, handle: ReactNode) => ReactNode;
  label: string;
  className?: string;
  axis?: "x" | "y";
  disabled?: boolean;
}) {
  const signature = items.map((item) => item.id).join(",");
  const [ids, setIds] = useState(items.map((item) => item.id));
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const latest = useRef(ids);
  const original = useRef(ids);
  const busy = useRef(false);
  const hintId = useId();
  useEffect(() => {
    const next = signature ? signature.split(",") : [];
    setIds(next);
    latest.current = next;
  }, [signature]);
  async function commit(next: string[]) {
    if (busy.current || next.join(",") === signature) return;
    const focused = document.activeElement as HTMLElement | null;
    busy.current = true;
    setSaving(true);
    try {
      await onCommit(next);
      setAnnouncement("Ordem salva.");
    } catch {
      const previous = signature ? signature.split(",") : [];
      setIds(previous);
      latest.current = previous;
      setAnnouncement("Não foi possível salvar a ordem. Tente novamente.");
    } finally {
      busy.current = false;
      setSaving(false);
      requestAnimationFrame(() => {
        if (document.activeElement === document.body && focused?.isConnected)
          focused.focus({ preventScroll: true });
      });
    }
  }
  function move(id: string, delta: number) {
    if (disabled || busy.current) return;
    const next = [...latest.current],
      index = next.indexOf(id),
      target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    latest.current = next;
    setIds(next);
    setAnnouncement(
      `${items.find((item) => item.id === id)?.name}: posição ${target + 1} de ${next.length}.`,
    );
    void commit(next);
  }
  return (
    <>
      <span id={hintId} className="sr-only">
        Arraste pela alça ou use as setas{" "}
        {axis === "y"
          ? "para cima e para baixo"
          : "para esquerda e para direita"}{" "}
        para mudar a posição.
      </span>
      <Reorder.Group
        as="div"
        axis={axis}
        values={ids}
        onReorder={(next) => {
          latest.current = next;
          setIds(next);
        }}
        className={`sortable-list ${className}`}
        aria-label={label}
        role="list"
      >
        {ids.map((id) => {
          const item = items.find((item) => item.id === id);
          return item ? (
            <SortableEntry
              key={id}
              item={item}
              axis={axis}
              disabled={disabled || saving || items.length < 2}
              hintId={hintId}
              onMove={(delta) => move(id, delta)}
              onStart={() => {
                original.current = [...latest.current];
              }}
              onEnd={() => {
                if (latest.current.join(",") !== original.current.join(","))
                  void commit(latest.current);
              }}
              render={render}
            />
          ) : null;
        })}
      </Reorder.Group>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
function SortableEntry<T extends Entry>({
  item,
  render,
  axis,
  disabled,
  hintId,
  onMove,
  onStart,
  onEnd,
}: {
  item: T;
  render: (item: T, handle: ReactNode) => ReactNode;
  axis: "x" | "y";
  disabled: boolean;
  hintId: string;
  onMove: (delta: number) => void;
  onStart: () => void;
  onEnd: () => void;
}) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  // A alça tem identidade estável (as funções do pai mudam a cada render e são lidas pela ref), para a linha
  // memorizada que a recebe não redesenhar à toa.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const handle = useMemo(() => (
    <Button variant="brand" size="brand"
      type="button"
      className="reorder-handle"
      disabled={disabled}
      aria-label={`Reordenar ${item.name}`}
      aria-describedby={hintId}
      title="Arraste para reordenar; use as setas pelo teclado"
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!disabled) {
          event.preventDefault();
          event.currentTarget.focus();
          controls.start(event);
        }
      }}
      onKeyDown={(event) => {
        const previous = axis === "y" ? "ArrowUp" : "ArrowLeft",
          next = axis === "y" ? "ArrowDown" : "ArrowRight";
        if (event.key === previous || event.key === next) {
          event.preventDefault();
          event.stopPropagation();
          onMoveRef.current(event.key === previous ? -1 : 1);
        }
      }}
    >
      <StaticListIcon name="grip-vertical" size={17} />
    </Button>
  ), [axis, controls, disabled, hintId, item.name]);
  return (
    <Reorder.Item
      as="div"
      value={item.id}
      layout="position"
      role="listitem"
      dragListener={false}
      dragControls={controls}
      drag={disabled ? false : axis}
      dragMomentum={false}
      onDragStart={() => { setDragging(true); onStart(); }}
      onDragEnd={() => { setDragging(false); onEnd(); }}
      className={`sortable-entry${dragging ? " is-dragging" : ""}`}
      style={{ position: "relative" }}
    >
      {render(item, handle)}
    </Reorder.Item>
  );
}
