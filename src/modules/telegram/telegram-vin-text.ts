import { HttpException } from "@nestjs/common";
import { botText, type BotLanguage } from "./telegram-conversation.types";

export const vinConsentText = (language: BotLanguage) => botText(language,
  "Це єдина безкоштовна VIN-перевірка на акаунт: одне джерело, один VIN. Відповідь «даних немає» також зараховується. Після неї повторні перевірки буде закрито до підключення оплати. Збережені звіти залишаться доступними.",
  "To jedyne bezpłatne sprawdzenie VIN na konto: jedno źródło, jeden VIN. Odpowiedź „brak danych” również się liczy. Kolejne sprawdzenia będą zablokowane do uruchomienia płatności. Zapisane raporty pozostaną dostępne.",
  "This is your account's only free VIN check: one source, one VIN. A no-data result also counts. Further checks will be locked until payments are enabled. Saved reports will remain available.");

export function vinErrorText(error: unknown, language: BotLanguage): string | null {
  const body = error instanceof HttpException ? error.getResponse() : null;
  const code = body && typeof body === "object" && "code" in body ? body.code : "";
  switch (code) {
    case "VIN_PROVIDER_NOT_CONFIGURED":
    case "VINCARIO_NOT_CONFIGURED":
    case "VIN_PROVIDER_AUTH_FAILED":
    case "VIN_PROVIDER_QUOTA_EXHAUSTED":
    case "VIN_PROVIDER_RATE_LIMITED": return botText(language, "VIN-провайдер зараз недоступний. Безкоштовну перевірку не використано. Зверніться до підтримки або спробуйте пізніше.", "Dostawca VIN jest obecnie niedostępny. Bezpłatne sprawdzenie nie zostało wykorzystane. Skontaktuj się z pomocą techniczną lub spróbuj później.", "The VIN provider is currently unavailable. Your free check has not been used. Contact support or try later.");
    case "VIN_TRIAL_USED": return botText(language, "Безкоштовну VIN-перевірку вже використано. Повторні перевірки закрито до підключення оплати. Збережені звіти доступні на сайті.", "Bezpłatne sprawdzenie VIN zostało już wykorzystane. Kolejne są zablokowane do uruchomienia płatności. Zapisane raporty są dostępne na stronie.", "Your free VIN check has already been used. Further checks are locked until payments are enabled. Saved reports are available on the website.");
    case "VIN_CHECK_IN_PROGRESS": return botText(language, "VIN-перевірка вже триває. Дочекайтеся результату.", "Sprawdzenie VIN już trwa. Poczekaj na wynik.", "A VIN check is already in progress. Please wait for the result.");
    case "VIN_CHECK_UNCERTAIN": return botText(language, "Результат попереднього VIN-запиту не підтверджено. Щоб уникнути повторного списання, нові перевірки заблоковано. Зверніться до підтримки.", "Wynik poprzedniego zapytania VIN nie został potwierdzony. Nowe sprawdzenia są zablokowane, aby uniknąć podwójnego obciążenia. Skontaktuj się z pomocą techniczną.", "The previous VIN request's result is unconfirmed. New checks are blocked to avoid a duplicate charge. Please contact support.");
    case "VIN_NO_DATA": return botText(language, "Джерело не має даних за цим VIN. Безкоштовну перевірку використано; це не підтверджує відсутність проблем з авто.", "Źródło nie ma danych dla tego VIN. Bezpłatne sprawdzenie zostało wykorzystane; nie oznacza to braku problemów z autem.", "The source has no data for this VIN. Your free check has been used; this does not prove the car has no issues.");
    default: return null;
  }
}
