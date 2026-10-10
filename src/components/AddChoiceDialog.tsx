import { ChevronRight, DoorOpen, PackagePlus } from "lucide-react";
import { Dialog } from "./Dialog";

/** Folha do botão "Adicionar" da barra inferior: a pessoa escolhe entre item e ambiente. */
export function AddChoiceDialog({
  isOpen,
  onClose,
  onItem,
  onCategory,
}: {
  isOpen: boolean;
  onClose: () => void;
  onItem: () => void;
  onCategory: () => void;
}) {
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Dialog title="Adicionar" isOpen={isOpen} onClose={onClose}>
      <div className="add-choice">
        <button type="button" onClick={choose(onItem)}>
          <span className="add-choice-icon" aria-hidden="true">
            <PackagePlus size={22} strokeWidth={1.6} />
          </span>
          <span className="add-choice-text">
            <strong>Item</strong>
            <small>Um produto para a sua lista</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button type="button" onClick={choose(onCategory)}>
          <span className="add-choice-icon" aria-hidden="true">
            <DoorOpen size={22} strokeWidth={1.6} />
          </span>
          <span className="add-choice-text">
            <strong>Ambiente</strong>
            <small>Um cômodo ou espaço da casa</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </Dialog>
  );
}
