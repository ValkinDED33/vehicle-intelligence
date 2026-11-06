import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fmtDate, vinApi, type StandaloneVinCheck } from "../api";
import { enumLabel, t } from "../i18n";
import { errText } from "../utils/formatters";

export function StandaloneVinChecks() {
  const [state, setState] = useState<{ rows: StandaloneVinCheck[]; error: string | null }>({ rows: [], error: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false, generation = 0;
    const load = async () => {
      const request = ++generation;
      try {
        const rows = await vinApi.savedChecks();
        if (!cancelled && request === generation) setState({ rows: Array.isArray(rows) ? rows : [], error: null });
      } catch (error) {
        if (!cancelled && request === generation) setState(previous => ({ ...previous, error: errText(error) }));
      }
    };
    void load(); window.addEventListener("focus", load);
    return () => { cancelled = true; window.removeEventListener("focus", load); };
  }, [retry]);
  if (!state.rows.length && !state.error) return null;
  return <section className="standalone-vin-checks">
    <h2>{t("VIN-перевірки з Telegram")}</h2>
    {state.error && <div className="auth-error" role="alert">{state.error}<button className="ghost-btn" title={t("Оновити")} aria-label={t("Оновити")} onClick={() => setRetry(value => value + 1)}><RefreshCw size={16}/></button></div>}
    {state.rows.map(check => <details className="standalone-vin-check" key={check.id}>
      <summary><b>{check.vin}</b><span>{[check.result.make, check.result.model, check.result.modelYear].filter(Boolean).join(" ")}</span><small>{check.result.provider} · {enumLabel(check.status)} · {fmtDate(check.createdAt, true)}</small></summary>
      <dl>{[[t("Марка"), check.result.make], [t("Модель"), check.result.model], [t("Рік"), check.result.modelYear], [t("Двигун"), check.result.engineCode], [t("Пальне"), check.result.fuelType], [t("Коробка"), check.result.transmissionType], [t("Привід"), check.result.driveType]].filter(([, value]) => value != null).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{enumLabel(String(value))}</dd></div>)}</dl>
      <pre>{JSON.stringify(check.result.rawPayload ?? check.result, null, 2)}</pre>
    </details>)}
  </section>;
}
