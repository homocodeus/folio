import { useI18n } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, Sparkles, X, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { desktop } from './storage';

export default function Portrait({ photo, onChange, onError }: { photo: string; onChange: (photo: string) => void; onError: (error: unknown) => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState('');
  const [consent, setConsent] = useState(false);
  const [outfit, setOutfit] = useState('A tailored navy business suit with a white shirt');
  function stop() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setCamera(false); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stream.current?.getTracks().forEach(track => track.stop()); }; }, []);
  useEffect(() => { if (camera && video.current) video.current.srcObject = stream.current; }, [camera]);
  async function start() {
    try { const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1024, height: 1024 }, audio: false }); if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; } stream.current = media; setCamera(true); }
    catch (error) { onError(error); }
  }
  function capture() {
    if (!video.current?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 840;
    const source = video.current;
    const ratio = Math.max(canvas.width / source.videoWidth, canvas.height / source.videoHeight);
    canvas.getContext('2d')!.drawImage(source, (canvas.width - source.videoWidth * ratio) / 2, (canvas.height - source.videoHeight * ratio) / 2, source.videoWidth * ratio, source.videoHeight * ratio);
    onChange(canvas.toDataURL('image/jpeg', 0.9)); stop(); setCandidate('');
  }
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a JPEG, PNG, or WebP image smaller than 10 MB.');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      onChange(canvas.toDataURL('image/jpeg', 0.9)); setCandidate('');
    } catch (error) { onError(error); }
  }
  async function suitUp() {
    setBusy(true);
    try { setCandidate(await invoke<string>('ai_portrait', { photo, outfit })); }
    catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <div className="portrait-panel"><div className="section-intro"><span className="eyebrow">{t("A GREAT FIRST IMPRESSION")}</span><h2>{t("Put a face to your story.")}</h2><p>{t("Take a photo or upload one you love. A portrait is optional — your experience speaks for itself.")}</p></div>
    <div className="photo-stage">{camera ? <video ref={video} autoPlay playsInline muted/> : candidate || photo ? <img src={candidate || photo} alt={candidate ? t("AI portrait for review") : t("Your portrait")}/> : <div className="photo-placeholder"><Camera size={42} strokeWidth={1}/><span>{t("Your portrait goes here")}</span></div>}{camera && <button className="camera-close icon-button" onClick={stop} aria-label={t("Stop camera")}><X size={18}/></button>}</div>
    <div className="button-row">{camera ? <button className="primary" onClick={capture}><Camera size={16}/>{t("Capture photo")}</button> : <button className="secondary" onClick={start}><Camera size={16}/>{t("Open camera")}</button>}<label className="secondary file-label"><Upload size={16}/>{t("Upload photo")}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/></label>{photo && <button className="text-button" onClick={() => { onChange(''); setCandidate(''); }}>{t("Remove")}</button>}</div>
    <div className="ai-portrait"><Sparkles size={20}/><h3>{t("A professional look, still you.")}</h3><p>{t("Ask your connected image model to change your outfit and background while preserving your facial identity. Review the result before using it.")}</p><label>{t("Portrait style")}<select value={outfit} onChange={event => setOutfit(event.target.value)}><option value="A tailored navy business suit with a white shirt">{t("A tailored navy business suit with a white shirt")}</option><option value="A charcoal blazer with a neutral shirt, smart casual">{t("A charcoal blazer with a neutral shirt, smart casual")}</option><option value="A professional black blazer with a light blouse">{t("A professional black blazer with a light blouse")}</option></select></label><label className="check-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>{t("Send this photo to my configured AI provider for editing.")}</label><button className="primary" disabled={!desktop || !photo || !consent || busy} onClick={suitUp}><Sparkles size={16}/>{busy ? t("Creating your portrait…") : t("Suit up with AI")}</button>{!desktop && <p className="hint">{t("AI portrait editing is available in the desktop app.")}</p>}{candidate && <div className="button-row"><button className="primary" onClick={() => { onChange(candidate); setCandidate(''); }}><Check size={16}/>{t("Use this portrait")}</button><button className="secondary" onClick={() => setCandidate('')}>{t("Keep original")}</button></div>}</div>
  </div>;
}
