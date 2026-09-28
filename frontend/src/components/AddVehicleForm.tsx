import { useState, type FormEvent } from "react";
import { CarFront } from "lucide-react";
import { garageApi } from "../api";
import { Field } from "./CommonComponents";
import { errText } from "../utils/formatters";

export function AddVehicleForm({ onDone }: { onDone: () => void }) {
  const [vin, setVin] = useState("");
  const [nickname, setNickname] = useState("");
  const [make, setMake] = useState("");
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
        modelYear: modelYear.trim() || undefined,
        licensePlate: plate.trim() || undefined,
        country: country.trim() || undefined,
      });
      setVin("");
      setNickname("");
      setMake("");
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
        <CarFront size={16} /> Новый автомобиль
      </h3>
      <div className="form-grid">
        <Field label="VIN (17 символов)">
          <input
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            maxLength={17}
            placeholder="WVWZZZ1KZAW000000"
          />
        </Field>
        <Field label="Название">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={80}
            placeholder="Мой Qashqai"
          />
        </Field>
        <Field label="Марка">
          <input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            maxLength={120}
            placeholder="Nissan"
          />
        </Field>
        <Field label="Год выпуска">
          <input
            value={modelYear}
            onChange={(e) =>
              setModelYear(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="2017"
          />
        </Field>
        <Field label="Госномер">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            maxLength={32}
            placeholder="XX 1234X"
          />
        </Field>
        <Field label="Страна">
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
        {busy ? "Добавляем..." : "ДОБАВИТЬ В ГАРАЖ"}
      </button>
    </form>
  );
}

