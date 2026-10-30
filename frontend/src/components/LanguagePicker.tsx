import { t, type UiLanguage } from "../i18n";

export function LanguagePicker({ language, onChange, disabled = false }: {
  language: UiLanguage;
  onChange: (language: UiLanguage) => void;
  disabled?: boolean;
}) {
  return <label className="language-chip" aria-label={t("Мова інтерфейсу")}>
    <img src={`/flags/${language}.svg`} alt={language === "uk" ? "Українська" : language === "pl" ? "Polski" : "English"}/>
    <select aria-label={t("Мова інтерфейсу")} value={language} disabled={disabled} onChange={event => onChange(event.target.value as UiLanguage)}>
      <option value="uk">Українська</option>
      <option value="pl">Polski</option>
      <option value="en">English</option>
    </select>
  </label>;
}
