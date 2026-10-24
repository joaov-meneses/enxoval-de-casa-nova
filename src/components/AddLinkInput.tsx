import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import type { InputHTMLAttributes } from 'react';
import { LoaderCircle, Plus } from "@/src/components/icons";
import './itemLinks.css';

/** Campo de link com o "+" ao lado: o link só é usado quando a pessoa toca no botão (ou aperta Enter). */
export function AddLinkInput({ value, addLabel, busy = false, message, onAdd, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  value: string; addLabel: string; busy?: boolean; message?: string; onAdd: () => void;
}) {
  const blocked = props.disabled || busy;
  return <div className="add-link-field">
    <div className="add-link-control">
      <Input {...props} value={value} disabled={blocked}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (value.trim()) onAdd(); } props.onKeyDown?.(event); }} />
      <Button variant="brand" size="brand" type="button" className="add-link-button" aria-label={addLabel} title={addLabel}
        disabled={blocked || !value.trim()} onClick={onAdd}>
        {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
      </Button>
    </div>
    {message && <span role="alert" className="add-link-feedback">{message}</span>}
  </div>;
}
