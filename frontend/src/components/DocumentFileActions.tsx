import { useRef, useState } from "react";
import { Check, Download, Eye, Loader2, Pencil, Save, ScanText, Upload, X } from "lucide-react";
import { documentsApi, type DocumentDetails, type VehicleDocument } from "../api";
import { t } from "../i18n";
import { errText } from "../utils/formatters";
import { documentFieldLabel } from "../utils/documentFields";

export function DocumentFileActions({ document: doc, onChanged }: { document: VehicleDocument; onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<DocumentDetails | null>(null);
  const [draft,setDraft]=useState<{id:string;valueText:string}[]|null>(null);
  const attached = Boolean(doc.storageKey);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 50 * 1024 * 1024) {
      setError(t("Виберіть PDF, PNG, JPEG або WebP розміром до 50 МБ.")); return;
    }
    await run(async () => {
      const target = await documentsApi.uploadTarget(doc.vehicleId, doc.id, file);
      const response = await fetch(target.uploadUrl, { method: target.method, headers: target.headers, body: file, credentials: 'omit' });
      if (!response.ok) throw new Error(t("Файл не завантажено. Спробуйте ще раз."));
      await documentsApi.confirmUpload(doc.vehicleId, doc.id, target, file.name);
      setDetails(null);setDraft(null);
      await onChanged();
    });
  };
  const process = () => {
    if (!window.confirm(t("Надіслати документ на AI-розпізнавання? Може використовуватися платний ліміт провайдера."))) return;
    void run(async () => { setDetails(await documentsApi.process(doc.vehicleId, doc.id)); setDraft(null); await onChanged(); });
  };
  const download = () => void run(async()=>{
    const popup=window.open('about:blank','_blank');
    if(!popup)throw new Error(t("Браузер заблокував відкриття файла."));
    popup.opener=null;
    try {
      const target=await documentsApi.download(doc.vehicleId,doc.id);
      const url=new URL(target.downloadUrl);
      if(url.protocol!=='https:')throw new Error(t("Некоректне посилання на файл."));
      popup.location.href=url.href;
    } catch(err) {popup.close();throw err;}
  });
  return <div className="document-files">
    <div className="document-file-tools">
      <input ref={input} type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void upload(file);}}/>
      {!attached&&<button className="ghost-btn" title={t("Прикріпити файл")} aria-label={t("Прикріпити файл")} disabled={busy} onClick={()=>input.current?.click()}><Upload size={16}/></button>}
      {attached&&<>
        <button className="ghost-btn" title={t("Завантажити файл")} aria-label={t("Завантажити файл")} disabled={busy} onClick={download}><Download size={16}/></button>
        <button className="ghost-btn" title={t("Розпізнати документ")} aria-label={t("Розпізнати документ")} disabled={busy||doc.processingStatus==='processing'} onClick={process}><ScanText size={16}/></button>
      </>}
      <button className="ghost-btn" title={t("Дані документа")} aria-label={t("Дані документа")} disabled={busy} onClick={()=>{setDraft(null);if(details)setDetails(null);else void run(async()=>setDetails(await documentsApi.get(doc.vehicleId,doc.id)));}}><Eye size={16}/></button>
      {busy&&<Loader2 size={16} className="spin"/>}
    </div>
    {doc.originalFileName&&<small className="sub">{doc.originalFileName}</small>}
    {error&&<div className="auth-error" role="alert">{error}</div>}
    {details&&<div className="document-details">
      <button className="ghost-btn" title={t("Закрити")} aria-label={t("Закрити")} disabled={busy} onClick={()=>{setDetails(null);setDraft(null);}}><X size={16}/></button>
      {details.fields.some(f=>f.source==='ai'||f.source==='ocr')&&<p className="state-note">{t("Розпізнані дані не підтверджені власником.")}</p>}
      {draft?<form onSubmit={e=>{e.preventDefault();void run(async()=>{setDetails(await documentsApi.confirmFields(doc.vehicleId,doc.id,{expectedUpdatedAt:details.document.updatedAt,fields:draft.map(({id,valueText})=>({id,valueText}))}));setDraft(null);await onChanged();});}}>
        {draft.map((field,index)=><label className="field" key={field.id}><span>{documentFieldLabel(details.fields.find(value=>value.id===field.id)!)}</span><textarea required maxLength={4000} disabled={busy} value={field.valueText} onChange={e=>setDraft(draft.map((value,i)=>i===index?{...value,valueText:e.target.value}:value))}/></label>)}
        <div className="document-file-tools"><button className="ghost-btn" disabled={busy} type="submit"><Save size={16}/>{t("Підтвердити перевірені дані")}</button><button className="ghost-btn" disabled={busy} type="button" onClick={()=>setDraft(null)}>{t("Скасувати")}</button></div>
      </form>:<>
        {details.fields.length?<dl>{details.fields.map(f=><div key={f.id}><dt>{documentFieldLabel(f)}{f.source==='manual'&&<Check size={12} aria-label={t("Підтверджено")}/>}</dt><dd>{f.valueText??f.valueNumber??JSON.stringify(f.valueJson)??'—'}</dd></div>)}</dl>:<p>{t("Розпізнаних полів немає.")}</p>}
        {details.fields.length>0&&<button className="ghost-btn" disabled={busy||doc.processingStatus==='processing'} onClick={()=>setDraft(details.fields.map(field=>({id:field.id,valueText:String(field.valueText??field.valueNumber??JSON.stringify(field.valueJson)??'')})))}><Pencil size={16}/>{t("Перевірити дані")}</button>}
      </>}
      {details.document.extractedText&&<details><summary>{t("Текст документа")}</summary><pre>{details.document.extractedText}</pre></details>}
    </div>}
  </div>;
}
