import { LockKeyhole, Search } from "lucide-react";
import type { VinAccessStatus } from "../api";
import { t } from "../i18n";

export const vinConsent = () => t("Одна безкоштовна VIN-перевірка на акаунт: одне джерело, один VIN. Відповідь «даних немає» також зараховується. Після перевірки повторні запити буде закрито до підключення оплати. Продовжити?");

export function VinAccessNotice({ access }: { access: VinAccessStatus | null }) {
  const available = access?.state === "available";
  return <div className="vin-access-note" role="status">
    {available ? <Search size={18}/> : <LockKeyhole size={18}/>}
    <div><b>{!access ? t("Статус VIN-доступу недоступний") : available ? t("Доступна 1 безкоштовна VIN-перевірка") : access.state === "in_progress" ? t("VIN-перевірка вже триває. Дочекайтеся результату.") : access.state === "uncertain" ? t("Результат VIN-запиту не підтверджено. Повторні перевірки заблоковано. Зверніться до підтримки.") : t("Безкоштовну VIN-перевірку використано. Повторні перевірки закрито до підключення оплати.")}</b>
    <p>{available ? t("Оберіть одне джерело. Відповідь «даних немає» також зараховується як перевірка.") : t("Збережені звіти й ручне редагування профілю залишаються доступними.")}</p></div>
  </div>;
}
