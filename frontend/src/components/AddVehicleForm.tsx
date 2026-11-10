import { t } from "./../i18n";
import { useState, type FormEvent } from "react";
import { CarFront } from "lucide-react";
import { garageApi } from "../api";
import { Field } from "./CommonComponents";
import { errText } from "../utils/formatters";

export function AddVehicleForm({ onDone }: { onDone: () => void }) {
  const [vin, setVin] = useState("");
  const [nickname, setNickname] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [plate, setPlate] = useState("");
  const [country, setCountry] = useState("PL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await garageApi.create({
        vin: vin.trim() ? vin.trim().toUpperCase() : undefined,
        nickname: nickname.trim() || undefined,
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        modelYear: modelYear.trim() || undefined,
        licensePlate: plate.trim() || undefined,
        country: country.trim() || undefined,
      });
      setVin("");
      setNickname("");
      setMake("");
      setModel("");
      setModelYear("");
      setPlate("");
      onDone();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-card" onSubmit={submit}>
      <h3>
        <CarFront size={16} /> {t("Новий автомобіль")} </h3>
      <div className="form-grid">
        <Field label={t("VIN (17 символів)")}>
          <input
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            maxLength={17}
            placeholder="WVWZZZ1KZAW000000"
          />
        </Field>
        <Field label={t("Назва")}>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={80}
            placeholder={t("Мій Qashqai")}
          />
        </Field>
        <Field label={t("Марка")}>
          <input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            maxLength={120}
            placeholder="Nissan"
          />
        </Field>
        <Field label={t("Модель")}><input value={model} onChange={e=>setModel(e.target.value)} maxLength={120} placeholder="Qashqai"/></Field>
        <Field label={t("Рік випуску")}>
          <input
            value={modelYear}
            onChange={(e) =>
              setModelYear(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="2017"
          />
        </Field>
        <Field label={t("Держномер")}>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            maxLength={32}
            placeholder="XX 1234X"
          />
        </Field>
        <Field label={t("Країна")}>
          <input
            value={country}
            onChange={(e) =>
              setCountry(e.target.value.toUpperCase().slice(0, 2))
            }
            maxLength={2}
            placeholder="PL"
          />
        </Field>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? t("Додаємо...") : t("ДОДАТИ В ГАРАЖ")}
      </button>
    </form>
  );
}
