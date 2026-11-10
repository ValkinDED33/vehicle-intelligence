require('reflect-metadata');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { GroqProvider } = require('../dist/common/ai-gateway/providers/groq.provider');
const { GoogleProvider } = require('../dist/common/ai-gateway/providers/google.provider');
const { OpenRouterProvider } = require('../dist/common/ai-gateway/providers/openrouter.provider');
const { NvidiaProvider } = require('../dist/common/ai-gateway/providers/nvidia.provider');
const { CloudflareProvider } = require('../dist/common/ai-gateway/providers/cloudflare.provider');
const { AiProviderRouter } = require('../dist/common/ai-gateway/ai-provider-router');
const { createAiProviderChain } = require('../dist/common/ai-gateway/ai-gateway.module');
const { AiGatewayService } = require('../dist/common/ai-gateway/ai-gateway.service');
const { AssistantService } = require('../dist/modules/assistant/assistant.service');
const { TelegramActionsService } = require('../dist/modules/telegram/telegram-actions.service');
const env = fs.existsSync('.env') ? require('dotenv').parse(fs.readFileSync('.env')) : {};
const config = { get: key => process.env[key] || env[key] };
const gateway = new AiGatewayService(new AiProviderRouter(createAiProviderChain(
  new GoogleProvider(config), new GroqProvider(config), new OpenRouterProvider(config),
  new NvidiaProvider(config), new CloudflareProvider(config),
), config));
const CAR = '11111111-1111-4111-8111-111111111111';
const OWNER = '33333333-3333-4333-8333-333333333333';
const vehicle = { id: CAR, make: 'Nissan', model: 'Qashqai', modelYear: '2017', country: 'PL' };
const garage = { getVehicles: async () => [vehicle], getVehicle: async () => vehicle };
const assistant = new AssistantService(
  gateway, garage,
  { getCurrentProfile: async () => ({ engineCode: 'K9K', fuelType: 'diesel' }) },
  { getLatestReading: async () => ({ odometerKm: 120000, recordedAt: new Date('2026-10-20') }) },
  { getStatus: async () => [{ rule: { id: 'oil-rule', title: 'Заміна оливи', intervalKm: 10000 }, urgency: 'attention', kmRemaining: 1500, daysRemaining: 60 }] },
  { getLatestDecode: async () => null },
  { getHistory: async () => [{ id: 'policy', type: 'insurance', title: 'OC', expiresAt: '2027-01-01' }] },
  { getHistory: async () => [], calculateLatestFullToFullConsumption: async () => null },
  { getHistory: async () => [{ title: 'Мийка', totalCost: '80.00', currency: 'PLN' }], getMonthlyCostOfOwnership: async () => ({ currencies: [{ currency: 'PLN', totalCost: 80 }] }) },
  { getHistory: async () => [{ title: 'Заміна оливи', odometerKm: 111500, occurredAt: '2026-10-01' }] },
  { getReports: async () => [] }, { getHistory: async () => [] },
  { list: async () => ({ telegramLinked: true, deliveryEnabled: true, reminders: [] }) },
);
const validator = new TelegramActionsService(garage);
const cases = [
  { name: 'inspection date with calendar month and week notices', message: 'У меня 10\\11-27 техосмотр, напомни за месяц и за неделю', check: turn => { assert.equal(turn.action?.operation, 'reminder'); assert.equal(turn.action.input.dueDate, '2027-11-10'); assert.deepEqual(turn.action.input.offsets, [{ amount: 1, unit: 'months' }, { amount: 1, unit: 'weeks' }]); } },
  { name: 'custom reminder periods and notification time', language: 'pl', message: 'Przypomnij mi o przeglądzie 10.11.2027: 2 miesiące, 3 dni wcześniej i w dniu przeglądu o 18:30 w Europe/Warsaw.', check: turn => { assert.equal(turn.action?.operation, 'reminder'); assert.equal(turn.action.input.remindAt, '18:30'); assert.equal(turn.action.input.offsets.length, 3); } },
  { name: 'general question without a saved car', vehicleId: undefined, message: 'Як правильно перевірити тиск у шинах?', check: turn => assert.equal(turn.action, null) },
  { name: 'mileage question is read-only', message: 'Чи нормальний пробіг 120000 км для цього авто?', check: turn => assert.equal(turn.action, null) },
  { name: 'missing currency asks a clarification', message: 'Запиши мийку за 80', check: turn => { assert.equal(turn.action, null); assert.match(turn.answer, /валют|грив|злот|PLN|UAH/i); } },
  { name: 'short currency follow-up completes the expense', message: 'PLN', history: [{ role: 'user', content: 'Запиши мийку за 80' }, { role: 'assistant', content: 'У якій валюті?' }], check: turn => { assert.equal(turn.action?.operation, 'expense'); assert.equal(turn.action.input.totalCost, 80); assert.equal(turn.action.input.currency, 'PLN'); assert.equal(turn.action.input.category, 'wash'); assert.equal(turn.action.input.odometerKm, undefined); assert.equal(turn.action.input.occurredAt, undefined); } },
  { name: 'fuel does not invent a full tank', message: 'Запиши заправку: 25 л дизелю за 150 PLN, пробіг 121000 км. Бак не повний.', check: turn => { assert.equal(turn.action?.operation, 'energy'); assert.equal(turn.action.input.isFullTank ?? false, false); assert.equal(turn.action.input.volumeLiters, 25); assert.equal(turn.action.input.totalCost, 150); } },
  { name: 'maintenance follow-up uses the saved context', message: 'А скільки кілометрів до неї залишилось?', history: [{ role: 'user', content: 'Коли замінити оливу?' }, { role: 'assistant', content: 'Наступна заміна оливи наближається.' }], check: turn => { assert.equal(turn.action, null); assert.match(turn.answer.replace(/[\s\u00a0]/g, ''), /1500/); } },
  { name: 'service-history question uses the real date', language: 'en', message: 'When was the last oil change?', check: turn => { assert.equal(turn.action, null); assert.match(turn.answer, /(?:2026-10-01|1(?:st)? October|October 1|1 Oct)/i); assert.doesNotMatch(turn.answer, /[А-Яа-яІіЇїЄє]/); } },
  { name: 'Polish answer follows the account language', language: 'pl', message: 'Dlaczego świeci kontrolka silnika?', check: turn => { assert.equal(turn.action, null); assert.doesNotMatch(turn.answer, /[А-Яа-яІіЇїЄє]/); assert.match(turn.answer, /kontrolk|silnik|diagnost|warsztat|bezpiecz|błąd|błędu/i); } },
  { name: 'Russian input still gets Ukrainian output', message: 'Что проверить перед поездкой?', check: turn => { assert.equal(turn.action, null); assert.doesNotMatch(turn.answer, /[ыэёъЫЭЁЪ]/); } },
  { name: 'warm tyres do not get an invented short cooling time', message: 'Я щойно проїхав 50 км. Вистачить 15 хвилин, щоб шини стали холодними для перевірки тиску?', check: turn => { assert.equal(turn.action, null); assert.match(turn.answer, /не достат|недостат|не вистач|не можна|ні[,.]|три год|3 год/i); assert.doesNotMatch(turn.answer, /прижміть|дверн\w* короб|стержн/i); } },
];

(async () => {
  const results = [];
  for (const item of cases.filter(item => !process.env.TELEGRAM_AI_CASE || item.name.includes(process.env.TELEGRAM_AI_CASE))) {
    if (results.length && process.env.TELEGRAM_AI_DELAY_MS) await new Promise(resolve => setTimeout(resolve, Number(process.env.TELEGRAM_AI_DELAY_MS)));
    try {
      const turn = await assistant.planTurn({ ownerId: OWNER, vehicleId: Object.hasOwn(item, 'vehicleId') ? item.vehicleId : CAR, language: item.language || 'uk', history: item.history, message: item.message });
      item.check(turn);
      if (turn.action) await validator.prepare(turn.action);
      results.push({ name: item.name, passed: true, answer: turn.answer, action: turn.action });
      console.log('PASS ' + item.name);
    } catch (error) {
      // Never print provider request objects, headers, or credential-bearing errors.
      const known = ['AI response exceeded the output limit', 'Invalid assistant turn', 'Empty assistant answer', 'Groq returned an empty response', 'Groq returned no final response after reasoning cleanup'];
      const reason = known.includes(error.message) ? error.message : error.status ? `HTTP ${error.status}` : error.name;
      results.push({ name: item.name, passed: false, errorType: reason });
      console.log('FAIL ' + item.name + ' (' + reason + ')');
    }
  }
  fs.mkdirSync('scratch', { recursive: true });
  const reportPath = process.env.TELEGRAM_AI_CASE
    ? `scratch/telegram-ai-check-${process.env.TELEGRAM_AI_CASE.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}.json`
    : 'scratch/telegram-ai-check.json';
  fs.writeFileSync(reportPath, JSON.stringify({ checkedAt: new Date().toISOString(), gateway: gateway.getProviderName(), results }, null, 2));
  console.log(`${results.filter(r => r.passed).length}/${results.length} live scenarios passed (fixture data only).`);
  if (results.some(r => !r.passed)) process.exitCode = 1;
})().catch(error => { console.log('Live checks failed: ' + error.name); process.exitCode = 1; });
