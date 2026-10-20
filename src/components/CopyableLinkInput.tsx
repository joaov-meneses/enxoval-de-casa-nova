import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { useState, type InputHTMLAttributes } from 'react';
import { Check, Copy } from "@/src/components/icons";
import './itemLinks.css';

export function CopyableLinkInput({ value, copyLabel, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  value: string; copyLabel: string;
}) {
  const [message, setMessage] = useState('');
  const [copiedValue, setCopiedValue] = useState('');
  const copied = Boolean(value && value === copiedValue);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const previous = document.activeElement as HTMLElement | null;
        const field = document.createElement('textarea');
        field.value = value; field.style.position = 'fixed'; field.style.opacity = '0';
        document.body.appendChild(field); field.select();
        try { if (!document.execCommand('copy')) throw new Error(); }
        finally { field.remove(); previous?.focus(); }
      }
      setCopiedValue(value); setMessage('Link copiado.');
    } catch { setMessage('Não foi possível copiar. Selecione o link e copie manualmente.'); }
  }
  return <div className="copyable-link-field">
    <div className="copyable-link-control">
      <Input {...props} value={value} onChange={event => { setMessage(''); setCopiedValue(''); props.onChange?.(event); }} />
      <Button variant="brand" size="brand" type="button" className="copyable-link-button" data-copy-link aria-label={copyLabel} title={copied ? 'Link copiado' : copyLabel} disabled={props.disabled || !value.trim()} onClick={() => void copy()}>
        {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
      </Button>
    </div>
    {message && <span role="status" className="copyable-link-feedback">{message}</span>}
  </div>;
}
