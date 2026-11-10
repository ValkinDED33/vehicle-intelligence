require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module, Global } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { AiGatewayModule, createAiProviderChain } = require('../dist/common/ai-gateway/ai-gateway.module');
const { AiGatewayService } = require('../dist/common/ai-gateway/ai-gateway.service');
const { AiProviderRouter } = require('../dist/common/ai-gateway/ai-provider-router');
const { AssistantService } = require('../dist/modules/assistant/assistant.service');
const { HealthController } = require('../dist/common/health/health.controller');
const get = (file, name) => require('../dist/modules/documents/services/' + file)[name];

function fakeProvider(name, execute, vision = true) {
  return { providerName: name, configured: true, capabilities: { text: true, json: true, vision, tools: false },
    complete: execute, analyzeImages: execute };
}

test('the actual global Nest AI module starts without optional credentials and health reads the gateway, not Groq env', async () => {
  const oldFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw Error('Unexpected network'); };
  class OfflineConfig {}
  Global()(OfflineConfig);
  Module({ providers: [{ provide: ConfigService, useValue: { get: () => undefined } }], exports: [ConfigService] })(OfflineConfig);
  class OfflineRoot {}
  Module({ imports: [OfflineConfig, AiGatewayModule] })(OfflineRoot);
  let app;
  try {
    app = await NestFactory.createApplicationContext(OfflineRoot, { logger: false });
    const gateway = app.get(AiGatewayService);
    assert.equal(gateway.getProviderName(), 'router');
    assert.equal(gateway.isConfigured(), false);
    await assert.rejects(gateway.complete({ systemPrompt: 'Test', userPrompt: 'Test' }), e => e.getResponse().code === 'AI_NO_COMPATIBLE_PROVIDER');
    const health = new HealthController({ connection: { execute: async () => {} } }, { get: key => key === 'B2_BUCKET' ? 'fixture' : key === 'VIN_PROVIDER_API_KEY' ? 'fixture' : undefined }, { assertAccess: async () => {} }, gateway);
    assert.equal((await health.check()).services.aiGateway, 'not_configured');
    const googleOnly = new AiGatewayService(new AiProviderRouter([fakeProvider('google', async () => { throw Error('No health inference'); })]));
    const googleHealth = new HealthController(health.databaseService, health.configService, health.objectStorage, googleOnly);
    assert.equal((await googleHealth.check()).services.aiGateway, 'configured');
    assert.equal(calls, 0);
  } finally { if (app) await app.close(); global.fetch = oldFetch; }
});

test('central chain order is shared by the Nest module and opt-in live script, not copied into feature modules', () => {
  const providers = ['google', 'groq', 'openrouter', 'nvidia', 'cloudflare'].map(name => fakeProvider(name, async () => {}));
  providers[2].emergencyProviders = () => [fakeProvider('openrouter-free', async () => {})];
  assert.deepEqual(createAiProviderChain(...providers).map(p => p.providerName), ['google', 'groq', 'nvidia', 'cloudflare', 'openrouter', 'openrouter-free']);
});

test('website chat, proofreading and Telegram JSON planning use the same router without native tools or autonomous writes', async () => {
  const seen = [];
  let groqCalls = 0;
  const primary = fakeProvider('google', async input => {
    seen.push(input);
    assert.equal(Object.hasOwn(input, 'tools'), false);
    return { provider: 'google', model: 'fixture-google', responseId: 'fixture', text: input.responseFormat === 'json'
      ? JSON.stringify({ answer: 'Review the expense.', action: { operation: 'expense', vehicleId: 'owned', input: { title: 'Wash', totalCost: 20, currency: 'PLN' } } })
      : 'Check the service history.' };
  });
  const engine = new AssistantService(new AiGatewayService(new AiProviderRouter([primary,
    fakeProvider('groq', async () => { groqCalls++; throw Error('Unexpected fallback'); }, false),
  ])), { getVehicles: async () => [{ id: 'owned', make: 'Fixture' }] });
  const response = await engine.chat({ ownerId: 'fixture-owner', message: 'What should I check?', language: 'en' });
  assert.equal(response.provider, 'google'); assert.equal(response.model, 'fixture-google');
  const turn = await engine.planTurn({ ownerId: 'fixture-owner', message: 'Save a wash expense of 20 PLN', language: 'en' });
  assert.equal(turn.action.operation, 'expense'); assert.equal(turn.action.input.totalCost, 20);
  assert.match(turn.answer, /No changes have been saved/);
  assert.equal(seen.length, 3); assert.equal(seen[2].responseFormat, 'json'); assert.equal(groqCalls, 0);
});

test('successful but malformed or semantically invalid planner JSON is rejected without another provider call', async () => {
  for (const text of ['{broken', '{"answer":12,"action":null}', '[]']) {
    let later = 0;
    const gateway = new AiGatewayService(new AiProviderRouter([
      fakeProvider('google', async () => ({ text, provider: 'google', model: 'fixture' })),
      fakeProvider('groq', async () => { later++; return { text: '{}', provider: 'groq', model: 'fixture' }; }),
    ]));
    await assert.rejects(new AssistantService(gateway, { getVehicles: async () => [] }).planTurn({ ownerId: 'fixture', message: 'Save something' }));
    assert.equal(later, 0);
  }
});

function sixPagePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 6 /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R 8 0 R] >>'];
  for (let n = 0; n < 6; n++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] /Resources << >> /Contents 9 0 R >>');
  const stream = '0 0 1 rg 5 5 20 20 re f\n';
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, n) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${n + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

test('real document parser and PDF renderer send one image and five-plus-one page batches only to vision-capable providers', async () => {
  const Normalizer = get('document-analysis-normalizer.service', 'DocumentAnalysisNormalizerService');
  const normalizer = new Normalizer(new (get('document-analysis-json-parser.service', 'DocumentAnalysisJsonParserService'))(),
    new (get('document-analysis-field-normalizer.service', 'DocumentAnalysisFieldNormalizerService'))(),
    new (get('document-field-canonicalizer.service', 'DocumentFieldCanonicalizerService'))());
  const requests = [];
  let groq = 0;
  const gateway = new AiGatewayService(new AiProviderRouter([
    fakeProvider('groq', async () => { groq++; throw Error('Text provider cannot receive document images'); }, false),
    fakeProvider('openrouter', async request => { requests.push(request); return { provider: 'openrouter', model: 'fixture-vl', text: '{"invoice_number":"FIXTURE-1","total_amount":120,"currency":"PLN"}' }; }),
  ]));
  const vision = new (get('document-vision.service', 'DocumentVisionService'))(gateway,
    new (get('document-analysis-prompt.service', 'DocumentAnalysisPromptService'))(),
    new (get('document-analysis-parser.service', 'DocumentAnalysisParserService'))(normalizer));
  const service = new (get('document-analysis.service', 'DocumentAnalysisService'))(
    { createDownloadTarget: async () => ({ downloadUrl: 'https://fixture-storage.test/invoice?signed=private' }), readStoredObject: async () => ({ buffer: sixPagePdf() }) },
    new (get('pdf-renderer.service', 'PdfRendererService'))(), vision, normalizer);
  service.logger.log = () => {};
  const image = await service.analyze({ mimeType: 'image/png', type: 'invoice', title: 'Fixture' });
  assert.ok(image.fields.some(field => field.fieldKey === 'invoice_number' && field.valueText === 'FIXTURE-1'));
  const pdf = await service.analyze({ mimeType: 'application/pdf', type: 'invoice', title: 'Fixture' });
  assert.ok(pdf.fields.some(field => field.fieldKey === 'currency' && field.valueText === 'PLN'));
  assert.deepEqual(requests.map(request => request.images.length), [1, 5, 1]);
  assert.match(requests[1].userPrompt, /pages 1-5 of 6/); assert.match(requests[2].userPrompt, /pages 6-6 of 6/);
  assert.ok(requests.slice(1).every(request => request.images.every(image => image.url.startsWith('data:image/png;base64,'))));
  assert.equal(groq, 0);
});

test('the shared deadline cancels the real REST/SDK request and prevents further fallback attempts', async t => {
  const oldFetch = global.fetch;
  const originalTimeout = AbortSignal.timeout;
  const { GoogleProvider } = require('../dist/common/ai-gateway/providers/google.provider');
  const { GroqProvider } = require('../dist/common/ai-gateway/providers/groq.provider');
  let deadline;
  t.mock.method(AbortSignal, 'timeout', ms => ms === 60000 ? deadline.signal : originalTimeout(ms));
  try {
    for (const Class of [GoogleProvider, GroqProvider]) {
      deadline = new AbortController();
      let calls = 0, later = 0;
      global.fetch = async (input, init) => {
        const request = new Request(input, init);
        calls++;
        deadline.abort(new DOMException('Fixture deadline', 'TimeoutError'));
        assert.equal(request.signal.aborted, true);
        throw request.signal.reason;
      };
      const values = { GOOGLE_API_KEY: 'fixture-key', GOOGLE_DATA_POLICY_APPROVED: 'true', GROQ_API_KEY: 'fixture-key' };
      const router = new AiProviderRouter([new Class({ get: key => values[key] }),
        fakeProvider('later', async () => { later++; throw Error('Budget already expired'); })]);
      router.logger.warn = () => {};
      await assert.rejects(router.complete({ systemPrompt: 'Fixture', userPrompt: 'Fixture' }), error => {
        assert.equal(error.getStatus(), 503);
        assert.equal(error.getResponse().code, 'AI_PROVIDERS_UNAVAILABLE');
        assert.equal(error.getResponse().failures.length, 1);
        return true;
      });
      assert.equal(calls, 1); assert.equal(later, 0);
    }
  } finally { global.fetch = oldFetch; }
});

test('invalid overall deadlines and using the emergency router as the fixed model fail before network traffic', async () => {
  for (const value of ['60001', '0', '-1', 'oops', '1.5']) {
    let calls = 0;
    const router = new AiProviderRouter([fakeProvider('fixture', async () => { calls++; })], { get: key => key === 'AI_GATEWAY_TIMEOUT_MS' ? value : undefined });
    await assert.rejects(router.complete({ systemPrompt: 'Fixture', userPrompt: 'Fixture' }), error => error.reason === 'invalid_AI_GATEWAY_TIMEOUT_MS');
    assert.equal(calls, 0);
  }
  const { OpenRouterProvider } = require('../dist/common/ai-gateway/providers/openrouter.provider');
  const values = { OPENROUTER_API_KEY: 'fixture-key', OPENROUTER_DATA_POLICY_APPROVED: 'true', OPENROUTER_MODEL: 'openrouter/free' };
  await assert.rejects(new OpenRouterProvider({ get: key => values[key] }).complete({ systemPrompt: 'Fixture', userPrompt: 'Fixture' }), error => error.reason === 'invalid_OPENROUTER_MODEL');
});

test('Google includes prompts and base64 JSON overhead in its 20 MB request-size limit', async () => {
  const { GoogleProvider } = require('../dist/common/ai-gateway/providers/google.provider');
  const values = { GOOGLE_API_KEY: 'fixture-key', GOOGLE_DATA_POLICY_APPROVED: 'true' };
  const provider = new GoogleProvider({ get: key => values[key] });
  const oldFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw Error('Oversized payload must not be sent'); };
  try {
    await assert.rejects(provider.complete({ systemPrompt: 'Fixture', userPrompt: 'x'.repeat(20_000_000) }), error => error.reason === 'input_too_large');
    await assert.rejects(provider.analyzeImages({ systemPrompt: 'Fixture', userPrompt: 'Fixture', images: [
      { url: 'data:image/png;base64,' + 'A'.repeat(20_000_000) },
    ] }), error => error.reason === 'image_input_too_large');
    assert.equal(calls, 0);
  } finally { global.fetch = oldFetch; }
});

test('real SDK connection errors remain transient even when their name is Error and cause is absent', () => {
  const { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } = require('openai');
  const { providerError } = require('../dist/common/ai-gateway/ai-provider-error');
  for (const error of [new APIConnectionError({ message: 'private fixture' }), new APIConnectionTimeoutError(), new APIUserAbortError()]) {
    assert.equal(error.name, 'Error');
    const safe = providerError('fixture', error);
    assert.equal(safe.technical, true); assert.equal(safe.reason, 'network_or_timeout');
    assert.doesNotMatch(JSON.stringify(safe), /private fixture/);
  }
});

test('a stalled SDK response body times out once and uses the next provider without hidden retries', async () => {
  const { GroqProvider } = require('../dist/common/ai-gateway/providers/groq.provider');
  const oldFetch = global.fetch;
  let calls = 0, next = 0, readingBody = false;
  global.fetch = async (input, init) => {
    calls++;
    const request = new Request(input, init);
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(Buffer.from('{"choices":'));
      request.signal.addEventListener('abort', () => controller.error(request.signal.reason), { once: true });
    } }), { headers: { 'Content-Type': 'application/json' } });
    const text = response.text.bind(response);
    response.text = () => { readingBody = true; return text(); };
    return response;
  };
  try {
    const values = { GROQ_API_KEY: 'fixture-only', GROQ_TIMEOUT_MS: '50' };
    const router = new AiProviderRouter([new GroqProvider({ get: key => values[key] }), fakeProvider('backup', async () => { next++; return { provider: 'backup', model: 'fixture', text: 'Recovered' }; })]);
    router.logger.warn = () => {};
    assert.equal((await router.complete({ systemPrompt: 'Fixture', userPrompt: 'Fixture' })).provider, 'backup');
    assert.equal(calls, 1); assert.equal(next, 1); assert.equal(readingBody, true);
  } finally { global.fetch = oldFetch; }
});

test('Google cancels rejected provider and storage response bodies before fallback or returning an input error', async () => {
  const { GoogleProvider } = require('../dist/common/ai-gateway/providers/google.provider');
  const oldFetch = global.fetch;
  let cancelled = 0;
  const response = (status, headers) => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled++; },
  }), { status, headers });
  try {
    const values = { GOOGLE_API_KEY: 'fixture-key', GOOGLE_DATA_POLICY_APPROVED: 'true', B2_S3_ENDPOINT: 'https://storage.example' };
    const provider = new GoogleProvider({ get: key => values[key] });
    global.fetch = async () => response(429, { 'Content-Type': 'application/json' });
    await assert.rejects(provider.complete({ systemPrompt: 'Fixture', userPrompt: 'Fixture' }), error => error.upstreamStatus === 429);
    assert.equal(cancelled, 1);
    for (const [status, headers] of [[503, { 'Content-Type': 'image/png' }], [200, { 'Content-Type': 'application/pdf' }], [200, { 'Content-Type': 'image/png', 'Content-Length': '19000001' }]]) {
      global.fetch = async () => response(status, headers);
      await assert.rejects(provider.analyzeImages({ systemPrompt: 'Fixture', userPrompt: 'Fixture', images: [{ url: 'https://storage.example/document.png' }] }), error => error.reason === 'image_input_unavailable');
    }
    assert.equal(cancelled, 4);
  } finally { global.fetch = oldFetch; }
});

test('Cloudflare honors the existing MODEL variable, Qwen vision/JSON support, low reasoning and no output storage', async () => {
  const { CloudflareProvider } = require('../dist/common/ai-gateway/providers/cloudflare.provider');
  const oldFetch = global.fetch;
  const requests = [];
  global.fetch = async (input, init) => {
    const request = new Request(input, init); requests.push(await request.json());
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"ok"}' } }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const values = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'fixture', CLOUDFLARE_MODEL: '@cf/qwen/qwen3.8-27b', CLOUDFLARE_AI_MODEL: 'ignored-legacy-value', CLOUDFLARE_DATA_POLICY_APPROVED: 'true', CLOUDFLARE_FREE_PLAN_CONFIRMED: 'true' };
    const provider = new CloudflareProvider({ get: key => values[key] });
    assert.equal(provider.capabilities.vision, true);
    await provider.analyzeImages({ systemPrompt: 'Fixture', userPrompt: 'Fixture', responseFormat: 'json', images: [{ url: 'data:image/png;base64,aW1hZ2U=' }] });
    assert.equal(requests[0].model, '@cf/qwen/qwen3.8-27b'); assert.equal(requests[0].reasoning_effort, 'low'); assert.equal(requests[0].store, false);
    assert.equal(requests[0].response_format.type, 'json_object'); assert.equal(requests.length, 1);
  } finally { global.fetch = oldFetch; }
});

test('NVIDIA/OpenRouter base URLs cannot redirect credentials to direct OpenAI or arbitrary hosts', async () => {
  for (const [Class, values, reason] of [
    [require('../dist/common/ai-gateway/providers/nvidia.provider').NvidiaProvider, { NVIDIA_API_KEY: 'fixture', NVIDIA_DATA_POLICY_APPROVED: 'true', NVIDIA_BASE_URL: 'https://api.openai.com/v1' }, 'invalid_NVIDIA_BASE_URL'],
    [require('../dist/common/ai-gateway/providers/openrouter.provider').OpenRouterProvider, { OPENROUTER_API_KEY: 'fixture', OPENROUTER_DATA_POLICY_APPROVED: 'true', OPENROUTER_BASE_URL: 'https://private.example/v1' }, 'invalid_OPENROUTER_BASE_URL'],
  ]) await assert.rejects(new Class({ get: key => values[key] }).complete({ systemPrompt: 'Fixture', userPrompt: 'Fixture' }), error => error.reason === reason);
});

test('read-only readiness checks never infer a free Cloudflare plan from missing permissions or an empty response', () => {
  const { cloudflarePlan } = require('../scripts/check-ai-gateway-config.cjs');
  assert.equal(cloudflarePlan(undefined), 'unverified'); assert.equal(cloudflarePlan([]), 'unverified');
  assert.equal(cloudflarePlan([{ rate_plan: { id: 'workers_free' } }]), 'free');
  assert.equal(cloudflarePlan([{ rate_plan: { id: 'workers_paid' } }, { rate_plan: { id: 'workers_free' } }]), 'paid');
});
