import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, Trash2 } from "@/src/components/icons";
import { Dialog } from './Dialog';
import { UserAvatar } from './UserAvatar';

export function ProfilePhotoEditor({ name, src, disabled, onUpload, onRemove }: {
  name: string; src?: string | null; disabled: boolean;
  onUpload: (file: File) => Promise<void>; onRemove: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [camera, setCamera] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const capture = useRef<HTMLInputElement>(null);
  const stopCamera = () => {
    generation.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  };
  useEffect(() => () => stopCamera(), []);
  useEffect(() => {
    if (!preview) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(preview); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stopCamera(); setCamera(false); setConnecting(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const close = () => { stopCamera(); setCamera(false); setPreview(null); setOpen(false); setConnecting(false); };
  const save = async (file: File) => {
    setError('');
    try { await onUpload(file); close(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.'); }
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (file) void save(file);
  };
  const startCamera = async () => {
    setError(''); setPreview(null);
    if (matchMedia('(pointer: coarse)').matches) { capture.current?.click(); return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('A câmera precisa de HTTPS ou localhost. Você pode enviar uma foto do dispositivo.'); return;
    }
    const attempt = ++generation.current;
    setCamera(true); setConnecting(true);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
      if (generation.current !== attempt) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
    } catch {
      stopCamera(); setCamera(false); setConnecting(false); setError('Não foi possível abrir a câmera. Verifique a permissão ou envie uma foto.');
    } finally { if (generation.current === attempt) setConnecting(false); }
  };
  const takePhoto = () => {
    const source = video.current;
    if (!source?.videoWidth) return;
    const canvas = document.createElement('canvas');
    const size = Math.min(source.videoWidth, source.videoHeight);
    canvas.width = canvas.height = Math.min(size, 960);
    canvas.getContext('2d')?.drawImage(source, (source.videoWidth - size) / 2, (source.videoHeight - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => { if (blob) { setPreview(blob); stopCamera(); setCamera(false); } }, 'image/jpeg', 0.9);
  };
  return <>
    <Button variant="brand" size="brand" type="button" className="profile-avatar-edit" aria-label="Alterar foto de perfil" disabled={disabled} onClick={() => { setError(''); setOpen(true); }}>
      <UserAvatar name={name} src={src} />
      <span className="profile-avatar-camera"><Camera size={15} aria-hidden="true" /></span>
    </Button>
    {open && createPortal(<Dialog title="Foto de perfil" isOpen={open} onClose={close} busy={disabled} className="profile-photo-dialog">
      <div className="profile-photo-picker">
        <p data-dialog-autofocus tabIndex={-1}>Escolha como atualizar sua foto.</p>
        <Input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="Escolher foto de perfil" onChange={choose} disabled={disabled} />
        <Input ref={capture} hidden type="file" accept="image/*" capture="user" aria-label="Tirar foto com o dispositivo" onChange={choose} disabled={disabled} />
        {camera && <div className="profile-camera-preview"><video ref={video} autoPlay muted playsInline aria-label="Prévia da câmera" />{connecting && <p role="status">Abrindo câmera…</p>}</div>}
        {previewUrl && <img className="profile-camera-photo" src={previewUrl} alt="Prévia da nova foto de perfil" />}
        {preview ? <><Button variant="brand" size="brand" className="button button-dark" disabled={disabled} onClick={() => void save(new File([preview], 'foto-perfil.jpg', { type: 'image/jpeg' }))}>Usar esta foto</Button><Button variant="brand" size="brand" className="button button-outline" disabled={disabled} onClick={() => void startCamera()}>Tirar outra foto</Button></> : camera ? <Button variant="brand" size="brand" className="button button-dark" disabled={disabled || connecting} onClick={takePhoto}>Capturar foto</Button> : <Button variant="brand" size="brand" className="button button-outline" disabled={disabled} onClick={() => void startCamera()}><Camera size={20} />Tirar foto</Button>}
        <Button variant="brand" size="brand" className="button button-outline" disabled={disabled} onClick={() => upload.current?.click()}><ImagePlus size={20} />Enviar foto</Button>
        {src && <Button variant="brand" size="brand" className="button button-outline" disabled={disabled} onClick={() => { void onRemove().then(close).catch(err => setError(err instanceof Error ? err.message : 'Não foi possível remover a foto.')); }}><Trash2 size={18} />Remover foto</Button>}
        <small>JPG, PNG ou WebP. Sua foto aparece nos menus da conta.</small>
        {error && <p className="profile-error" role="alert">{error}</p>}
      </div>
    </Dialog>, document.body)}
  </>;
}
