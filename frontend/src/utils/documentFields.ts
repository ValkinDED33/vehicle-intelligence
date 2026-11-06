import { t } from "../i18n";
import type { DocumentField } from "../api";

const LABELS: Record<string,string> = {
  vin: "VIN", policy_number: "Номер поліса", document_number: "Номер документа", invoice_number: "Номер рахунку",
  registration_number: "Держномер", issuer: "Ким видано", insurer: "Страхова компанія", buyer: "Покупець",
  issuer_tax_id: "Податковий номер продавця", buyer_tax_id: "Податковий номер покупця",
  valid_from: "Діє з", valid_until: "Діє до", issued_at: "Дата видачі", payment_date: "Дата оплати",
  total_amount: "Сума", net_amount: "Сума без податку", tax_amount: "Сума податку", tax_rate: "Ставка податку",
  currency: "Валюта", odometer_km: "Одометр, км", vehicle_make: "Марка", vehicle_model: "Модель",
};

export function documentFieldLabel(field: DocumentField): string {
  return LABELS[field.fieldKey] ? t(LABELS[field.fieldKey]) : field.fieldLabel??field.fieldKey;
}
