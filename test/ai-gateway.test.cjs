require('reflect-metadata');
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('node:util');
const { HttpException } = require('@nestjs/common');
const { AiProviderRouter } = require('../dist/common/ai-gateway/ai-provider-router');
const { AiGatewayService } = require('../dist/common/ai-gateway/ai-gateway.service');
const { AiProviderError, providerError, finalText } = require('../dist/common/ai-gateway/ai-provider-error');
const { createAiProviderChain } = require('../dist/common/ai-gateway/ai-gateway.module');
const { GoogleProvider } = require('../dist/common/ai-gateway/providers/google.provider');
const { GroqProvider } = require('../dist/common/ai-gateway/providers/groq.provider');
const { NvidiaProvider } = require('../dist/common/ai-gateway/providers/nvidia.provider');
const { CloudflareProvider } = require('../dist/common/ai-gateway/providers/cloudflare.provider');
const { OpenRouterProvider } = require('../dist/common/ai-gateway/providers/openrouter.provider');

const ACCOUNT = 'a'.repeat(32);
const RAW_ERROR = 'SECRET_UPSTREAM https://storage.example/file?signature=SECRET_SIGNED_URL';
const TEXT = { systemPrompt: 'System instructions', userPrompt: 'SECRET_PROMPT', purpose: 'assistant' };
const JSON_REQUEST = { ...TEXT, responseFormat: 'json' };
const IMAGE = 'data:image/png;base64,aW1hZ2U=';
const VISION = { ...JSON_REQUEST, images: [{ url: IMAGE }] };
const TRANSIENT_STATUSES = [408, 429, 500, 502, 503, 504];
const PERMANENT_STATUSES = [400, 401, 403, 404, 422, 501];
const NETWORK_CODES = [
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
];
const PROVIDERS = [
  {
    name: 'google', Class: GoogleProvider,
    values: { GOOGLE_API_KEY: 'SECRET_API_KEY_google', GOOGLE_DATA_POLICY_APPROVED: 'true' },
    policy: 'GOOGLE_DATA_POLICY_APPROVED', key: 'GOOGLE_API_KEY',
    modelKey: 'GOOGLE_MODEL', invalidModelReason: 'unverified_GOOGLE_MODEL',
    model: 'gemini-3.8-flash', tokens: 2048,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  },
  {
    name: 'groq', Class: GroqProvider,
    values: { GROQ_API_KEY: 'SECRET_API_KEY_groq' }, key: 'GROQ_API_KEY',
    model: 'openai/gpt-oss-120b', tokens: 2048,
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  },
  {
    name: 'nvidia', Class: NvidiaProvider,
    values: { NVIDIA_API_KEY: 'SECRET_API_KEY_nvidia', NVIDIA_DATA_POLICY_APPROVED: 'true' },
    policy: 'NVIDIA_DATA_POLICY_APPROVED', key: 'NVIDIA_API_KEY',
    modelKey: 'NVIDIA_MODEL', invalidModelReason: 'unverified_NVIDIA_MODEL',
    model: 'nvidia/nemotron-3.5-super-vl-120b-a12b', tokens: 4096,
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
  },
  {
    name: 'cloudflare', Class: CloudflareProvider,
    values: {
      CLOUDFLARE_API_TOKEN: 'SECRET_API_KEY_cloudflare', CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_DATA_POLICY_APPROVED: 'true', CLOUDFLARE_FREE_PLAN_CONFIRMED: 'true',
    },
    policy: 'CLOUDFLARE_DATA_POLICY_APPROVED', key: 'CLOUDFLARE_API_TOKEN',
    modelKey: 'CLOUDFLARE_AI_MODEL', invalidModelReason: 'unverified_CLOUDFLARE_MODEL',
    model: '@cf/meta/llama-4-scout-17b-16e-instruct', tokens: 4096,
    endpoint: `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`,
  },
  {
    name: 'openrouter', Class: OpenRouterProvider,
    values: { OPENROUTER_API_KEY: 'SECRET_API_KEY_openrouter', OPENROUTER_DATA_POLICY_APPROVED: 'true' },
    policy: 'OPENROUTER_DATA_POLICY_APPROVED', key: 'OPENROUTER_API_KEY',
    modelKey: 'OPENROUTER_MODEL', invalidModelReason: 'invalid_OPENROUTER_MODEL',
    model: 'nvidia/nemotron-3.5-super-vl:free', tokens: 2048,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  },
];
const config = values => ({ get: key => values[key] });
const instance = (spec, overrides = {}) => new spec.Class(config({ ...spec.values, ...overrides }));
const result = provider => ({ provider, model: `${provider}-actual-model`, text: 'Final answer', responseId: `${provider}-id` });

function fakeProvider(name, options = {}) {
  const calls = [];
  return {
    providerName: name, configured: options.configured ?? true, calls,
    capabilities: { text: true, json: true, vision: true, tools: true, ...options.capabilities },
    async complete(request) {
      calls.push({ method: 'complete', request });
      return options.complete ? options.complete(request) : result(name);
    },
    async analyzeImages(request) {
      calls.push({ method: 'analyzeImages', request });
      return options.analyzeImages ? options.analyzeImages(request) : result(name);
    },
  };
}

function routerFor(providers, logs = []) {
  const router = new AiProviderRouter(providers);
  router.logger = { warn: message => logs.push(message), error: message => logs.push(message) };
  return router;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function output(spec, text = 'Final answer', finishReason, metadata = true) {
  if (spec.name === 'google') return {
    ...(metadata ? { modelVersion: 'actual-deployed-model', responseId: 'actual-response-id' } : {}),
    candidates: [{ content: { parts: [{ text: 'SECRET_THOUGHT', thought: true }, { text }] }, finishReason: finishReason ?? 'STOP' }],
  };
  return {
    ...(metadata ? { model: 'actual-deployed-model', id: 'actual-response-id' } : {}),
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: finishReason ?? 'stop' }],
  };
}

// Intercept the real SDK transport, not chat.completions.create, to catch hidden retries.
function interceptFetch(handler) {
  const calls = [];
  global.fetch = async (input, init) => {
    const request = new Request(input, init);
    const call = {
      url: request.url, method: request.method, headers: request.headers,
      redirect: request.redirect, signal: request.signal,
      body: request.method === 'POST' ? await request.json() : undefined,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return calls;
}

function assertRedacted(error) {
  const visible = inspect(error, { depth: 10 }) + JSON.stringify(error) + JSON.stringify(error.getResponse());
  assert.doesNotMatch(visible, /SECRET_|signature=|storage\.example/);
  assert.equal(error.cause, undefined);
}

function isProviderError(provider, reason, technical = false, upstreamStatus) {
  return error => {
    assert.ok(error instanceof AiProviderError);
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 502);
    assert.equal(error.provider, provider);
    assert.equal(error.reason, reason);
    assert.equal(error.technical, technical);
    assert.equal(error.upstreamStatus, upstreamStatus);
    assertRedacted(error);
    return true;
  };
}

describe('offline centralized AI gateway', { concurrency: false }, () => {
  let originalFetch;
  let unexpectedFetches;
  beforeEach(() => {
    originalFetch = global.fetch;
    unexpectedFetches = 0;
    global.fetch = async () => {
      unexpectedFetches++;
      throw new Error('Offline test blocked an unexpected fetch');
    };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    assert.equal(unexpectedFetches, 0, 'No unmocked transport is allowed');
  });

  test('primary success preserves the response and request without calling later providers', async () => {
    const expected = result('primary');
    const primary = fakeProvider('primary', { complete: () => expected });
    const backup = fakeProvider('backup');
    const gateway = new AiGatewayService(routerFor([primary, backup]));
    assert.equal(gateway.isConfigured(), true);
    assert.equal(gateway.getProviderName(), 'router');
    assert.equal(await gateway.complete(JSON_REQUEST), expected);
    assert.equal(primary.calls[0].request, JSON_REQUEST);
    assert.equal(primary.calls.length, 1);
    assert.equal(backup.calls.length, 0);
  });

  for (const status of TRANSIENT_STATUSES) {
    test(`router falls back once on HTTP ${status}`, async () => {
      const logs = [];
      const primary = fakeProvider('primary', { complete: () => { throw Object.assign(new Error(RAW_ERROR), { status }); } });
      const backup = fakeProvider('backup');
      assert.deepEqual(await routerFor([primary, backup], logs).complete(JSON_REQUEST), result('backup'));
      assert.equal(primary.calls.length, 1);
      assert.equal(backup.calls.length, 1);
      assert.equal(backup.calls[0].request, JSON_REQUEST);
      assert.match(logs.join('\n'), /Falling back primary -> backup/);
      assert.doesNotMatch(logs.join('\n'), /SECRET_|signature=/);
      if (status === 429) assert.match(logs.join('\n'), /quota\/rate limit/);
    });
  }

  for (const code of NETWORK_CODES) {
    test(`router falls back on nested network code ${code}`, async () => {
      const primary = fakeProvider('primary', {
        complete: () => { throw new Error(RAW_ERROR, { cause: { cause: { code } } }); },
      });
      const backup = fakeProvider('backup');
      assert.deepEqual(await routerFor([primary, backup]).complete(TEXT), result('backup'));
      assert.equal(primary.calls.length, 1);
      assert.equal(backup.calls.length, 1);
    });
  }

  for (const name of ['APIConnectionError', 'APIConnectionTimeoutError', 'TimeoutError', 'AbortError']) {
    test(`router falls back on ${name}`, async () => {
      const primary = fakeProvider('primary', { complete: () => { throw Object.assign(new Error(RAW_ERROR), { name }); } });
      const backup = fakeProvider('backup');
      assert.deepEqual(await routerFor([primary, backup]).complete(TEXT), result('backup'));
      assert.equal(backup.calls.length, 1);
    });
  }

  for (const status of PERMANENT_STATUSES) {
    test(`router never falls back on HTTP ${status}`, async () => {
      const primary = fakeProvider('primary', { complete: () => { throw Object.assign(new Error(RAW_ERROR), { status }); } });
      const backup = fakeProvider('backup');
      await assert.rejects(routerFor([primary, backup]).complete(TEXT), isProviderError('primary', `http_${status}`, false, status));
      assert.equal(primary.calls.length, 1);
      assert.equal(backup.calls.length, 0);
    });
  }

  for (const reason of ['unsupported_vision', 'unsupported_tools', 'invalid_response_or_configuration', 'output_limit', 'empty_response']) {
    test(`typed ${reason} is terminal, not an outage`, async () => {
      const failure = new AiProviderError('primary', reason);
      const primary = fakeProvider('primary', { complete: () => { throw failure; } });
      const backup = fakeProvider('backup');
      await assert.rejects(routerFor([primary, backup]).complete(TEXT), error => error === failure);
      assert.equal(backup.calls.length, 0);
    });
  }

  test('exhausted providers produce an ordered safe 503 aggregate and are never retried', async () => {
    const logs = [];
    const skipped = fakeProvider('absent', { configured: false });
    const first = fakeProvider('google', { complete: () => { throw Object.assign(new Error(RAW_ERROR), { status: 429 }); } });
    const second = fakeProvider('groq', { complete: () => { throw Object.assign(new Error(RAW_ERROR), { code: 'ECONNRESET' }); } });
    const third = fakeProvider('openrouter', { complete: () => { throw { status: 503, headers: { authorization: 'SECRET_API_KEY' }, body: RAW_ERROR }; } });
    await assert.rejects(routerFor([skipped, first, second, third], logs).complete(JSON_REQUEST), error => {
      assert.equal(error.getStatus(), 503);
      assert.deepEqual(error.getResponse(), {
        code: 'AI_PROVIDERS_UNAVAILABLE', capability: 'json', failures: [
          { provider: 'google', reason: 'http_429', upstreamStatus: 429 },
          { provider: 'groq', reason: 'network_or_timeout' },
          { provider: 'openrouter', reason: 'http_503', upstreamStatus: 503 },
        ],
      });
      assertRedacted(error);
      return true;
    });
    assert.deepEqual([skipped, first, second, third].map(provider => provider.calls.length), [0, 1, 1, 1]);
    assert.doesNotMatch(logs.join('\n'), /SECRET_|signature=/);
  });

  test('capabilities exclude inactive providers and never advertise a tool execution runtime', () => {
    const inactive = fakeProvider('inactive', { configured: false });
    const active = fakeProvider('active', { capabilities: { json: false, vision: false } });
    const router = routerFor([inactive, active]);
    assert.deepEqual(router.capabilities, { text: true, json: false, vision: false, tools: false });
    assert.equal(new AiGatewayService(routerFor([])).isConfigured(), false);
    assert.deepEqual(routerFor([]).capabilities, { text: false, json: false, vision: false, tools: false });
  });

  test('unsupported advertised capabilities are skipped before any request', async () => {
    const noText = fakeProvider('no-text', { capabilities: { text: false } });
    const noJson = fakeProvider('no-json', { capabilities: { json: false } });
    const backup = fakeProvider('backup');
    assert.deepEqual(await routerFor([noText, noJson, backup]).complete(JSON_REQUEST), result('backup'));
    assert.equal(noText.calls.length + noJson.calls.length, 0);
  });

  test('vision fallback skips real Groq and preserves the image request', async () => {
    const primary = fakeProvider('google', { analyzeImages: () => { throw { status: 504 }; } });
    const groq = instance(PROVIDERS.find(spec => spec.name === 'groq'));
    let groqCalls = 0;
    groq.analyzeImages = async () => { groqCalls++; throw new Error('Groq must not receive images'); };
    const backup = fakeProvider('openrouter');
    assert.deepEqual(await new AiGatewayService(routerFor([primary, groq, backup])).analyzeImages(VISION), result('openrouter'));
    assert.equal(groqCalls, 0);
    assert.deepEqual(primary.calls, [{ method: 'analyzeImages', request: VISION }]);
    assert.equal(backup.calls[0].request, VISION);
  });

  for (const [request, vision, capability] of [[TEXT, false, 'text'], [JSON_REQUEST, false, 'json'], [VISION, true, 'vision']]) {
    test(`no compatible ${capability} provider reports a safe 503 without traffic`, async () => {
      const provider = fakeProvider('incompatible', { capabilities: { text: false, json: false, vision: false } });
      const router = routerFor([provider]);
      await assert.rejects(vision ? router.analyzeImages(request) : router.complete(request), error => {
        assert.equal(error.getStatus(), 503);
        assert.deepEqual(error.getResponse(), { code: 'AI_NO_COMPATIBLE_PROVIDER', capability, failures: [] });
        return true;
      });
      assert.equal(provider.calls.length, 0);
    });
  }

  test('empty vision is rejected before routing', async () => {
    const primary = fakeProvider('primary');
    await assert.rejects(routerFor([primary]).analyzeImages({ ...VISION, images: [] }), isProviderError('router', 'http_400', false, 400));
    assert.equal(primary.calls.length, 0);
  });

  test('chain factory preserves both legacy arguments and the full provider order', () => {
    const [google, groq, nvidia, cloudflare, openrouter] = PROVIDERS.map(spec => instance(spec));
    assert.deepEqual(createAiProviderChain(google, groq, openrouter), [google, groq, openrouter]);
    assert.deepEqual(createAiProviderChain(google, groq, openrouter, nvidia, cloudflare), [google, groq, nvidia, cloudflare, openrouter]);
    const emergency = instance(PROVIDERS[4], { OPENROUTER_EMERGENCY_MODEL: 'openrouter/free' });
    assert.deepEqual(createAiProviderChain(google, groq, emergency, nvidia, cloudflare).map(provider => provider.providerName),
      ['google', 'groq', 'nvidia', 'cloudflare', 'openrouter', 'openrouter-free']);
  });

  test('missing optional credentials leave Groq usable without touching other transports', async () => {
    const values = { GROQ_API_KEY: 'SECRET_API_KEY_groq' };
    const [google, groq, nvidia, cloudflare, openrouter] = PROVIDERS.map(spec => new spec.Class(config(values)));
    const calls = interceptFetch(() => jsonResponse(output(PROVIDERS[1])));
    const router = routerFor(createAiProviderChain(google, groq, openrouter, nvidia, cloudflare));
    assert.equal((await router.complete(TEXT)).provider, 'groq');
    assert.deepEqual([google, groq, nvidia, cloudflare, openrouter].map(provider => provider.configured), [false, true, false, false, false]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, PROVIDERS[1].endpoint);
  });

  test('an entirely keyless installation fails safely for text and vision without traffic', async () => {
    const [google, groq, nvidia, cloudflare, openrouter] = PROVIDERS.map(spec => new spec.Class(config({})));
    const router = routerFor(createAiProviderChain(google, groq, openrouter, nvidia, cloudflare));
    assert.equal(router.configured, false);
    for (const provider of [google, groq, nvidia, cloudflare, openrouter]) assert.equal(provider.unavailableReason, 'not_configured');
    for (const work of [() => router.complete(TEXT), () => router.analyzeImages(VISION)]) {
      await assert.rejects(work, error => error.getStatus() === 503 && error.getResponse().code === 'AI_NO_COMPATIBLE_PROVIDER');
    }
  });

  for (const spec of PROVIDERS.filter(spec => spec.policy)) {
    for (const approval of [undefined, 'false', 'TRUE', '1']) {
      test(`${spec.name} requires explicit privacy approval (${String(approval)})`, async () => {
        const provider = instance(spec, { [spec.policy]: approval });
        assert.equal(provider.configured, false);
        assert.equal(provider.unavailableReason, 'data_policy_not_approved');
        await assert.rejects(provider.complete(TEXT), isProviderError(spec.name, 'data_policy_not_approved'));
        await assert.rejects(provider.analyzeImages(VISION), isProviderError(spec.name, 'data_policy_not_approved'));
        const backup = fakeProvider('approved-backup');
        assert.deepEqual(await routerFor([provider, backup]).complete(TEXT), result('approved-backup'));
      });
    }
    test(`${spec.name} approval alone never substitutes for credentials`, async () => {
      const provider = instance(spec, { [spec.key]: undefined });
      assert.equal(provider.configured, false);
      await assert.rejects(provider.complete(TEXT), isProviderError(spec.name, 'not_configured'));
    });
    test(`${spec.name} rejects unverified or paid model overrides without fallback`, async () => {
      const provider = instance(spec, { [spec.modelKey]: 'unverified/paid-model' });
      const backup = fakeProvider('backup');
      await assert.rejects(routerFor([provider, backup]).complete(TEXT), isProviderError(spec.name, spec.invalidModelReason));
      assert.equal(backup.calls.length, 0);
    });
  }

  for (const approval of [undefined, 'false', 'TRUE', '1']) {
    test(`Cloudflare also requires explicit free-plan confirmation (${String(approval)})`, async () => {
      const provider = instance(PROVIDERS[3], { CLOUDFLARE_FREE_PLAN_CONFIRMED: approval });
      assert.equal(provider.configured, false);
      assert.equal(provider.unavailableReason, 'free_plan_not_confirmed');
      await assert.rejects(provider.complete(TEXT), isProviderError('cloudflare', 'free_plan_not_confirmed'));
      await assert.rejects(provider.analyzeImages(VISION), isProviderError('cloudflare', 'free_plan_not_confirmed'));
    });
  }

  for (const account of ['', undefined, 'a'.repeat(31), 'g'.repeat(32), '../SECRET_API_KEY']) {
    test(`Cloudflare rejects invalid account ID ${String(account)} without traffic`, async () => {
      const provider = instance(PROVIDERS[3], { CLOUDFLARE_ACCOUNT_ID: account });
      await assert.rejects(provider.complete(TEXT), isProviderError('cloudflare', account ? 'invalid_CLOUDFLARE_ACCOUNT_ID' : 'not_configured'));
    });
  }

  test('Google accepts the Gemini key alias and prefers an explicit Google key', async () => {
    const calls = interceptFetch(() => jsonResponse(output(PROVIDERS[0])));
    const alias = instance(PROVIDERS[0], { GOOGLE_API_KEY: undefined, GEMINI_API_KEY: 'SECRET_API_KEY_alias' });
    assert.equal(alias.configured, true);
    await alias.complete(TEXT);
    await instance(PROVIDERS[0], { GEMINI_API_KEY: 'SECRET_API_KEY_alias' }).complete(TEXT);
    assert.equal(calls[0].headers.get('x-goog-api-key'), 'SECRET_API_KEY_alias');
    assert.equal(calls[1].headers.get('x-goog-api-key'), 'SECRET_API_KEY_google');
    assert.ok(calls.every(call => !call.url.includes('SECRET_')));
  });

  for (const spec of PROVIDERS) {
    test(`${spec.name} real transport uses JSON mode and returns actual model/id`, async () => {
      const calls = interceptFetch(() => jsonResponse(output(spec, ' <think>SECRET_THOUGHT</think> {"answer":"ok"} ')));
      const response = await instance(spec).complete(JSON_REQUEST);
      assert.deepEqual(response, { provider: spec.name, model: 'actual-deployed-model', responseId: 'actual-response-id', text: '{"answer":"ok"}' });
      assert.equal(calls.length, 1);
      const call = calls[0];
      assert.equal(call.url, spec.endpoint);
      assert.equal(call.method, 'POST');
      assert.ok(call.signal instanceof AbortSignal);
      assert.equal('tools' in call.body, false);
      if (spec.name === 'google') {
        assert.equal(call.redirect, 'error');
        assert.equal(call.headers.get('x-goog-api-key'), spec.values[spec.key]);
        assert.deepEqual(call.body.systemInstruction, { parts: [{ text: TEXT.systemPrompt }] });
        assert.deepEqual(call.body.contents, [{ role: 'user', parts: [{ text: TEXT.userPrompt }] }]);
        assert.deepEqual(call.body.generationConfig, { maxOutputTokens: spec.tokens, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } });
      } else {
        assert.equal(call.headers.get('authorization'), `Bearer ${spec.values[spec.key]}`);
        assert.equal(call.body.model, spec.model);
        assert.equal(call.body.max_tokens, spec.tokens);
        assert.deepEqual(call.body.response_format, { type: 'json_object' });
        assert.deepEqual(call.body.messages, [{ role: 'system', content: TEXT.systemPrompt }, { role: 'user', content: TEXT.userPrompt }]);
        if (spec.name === 'nvidia') assert.equal(call.body.reasoning_effort, 'low');
        if (spec.name === 'openrouter') assert.deepEqual(call.body.provider, {
          allow_fallbacks: false, require_parameters: true, data_collection: 'deny',
          max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
        });
      }
    });

    test(`${spec.name} plain text omits JSON enforcement and missing model metadata uses the requested model`, async () => {
      const calls = interceptFetch(() => jsonResponse(output(spec, ' Plain answer ', undefined, false)));
      const response = await instance(spec).complete(TEXT);
      assert.equal(response.text, 'Plain answer');
      assert.equal(response.model, spec.model);
      assert.equal(response.responseId, undefined);
      assert.equal(spec.name === 'google' ? calls[0].body.generationConfig.responseMimeType : calls[0].body.response_format, undefined);
    });

    for (const status of [...TRANSIENT_STATUSES, 400, 401, 403, 404]) {
      test(`${spec.name} HTTP ${status} is sanitized and sends exactly one request`, async () => {
        const calls = interceptFetch(() => jsonResponse({ error: { message: RAW_ERROR, code: status } }, status));
        await assert.rejects(instance(spec).complete(JSON_REQUEST), isProviderError(spec.name, `http_${status}`, TRANSIENT_STATUSES.includes(status), status));
        assert.equal(calls.length, 1, 'SDK/provider retries must stay disabled');
      });
    }

    for (const transport of ['network', 'timeout']) {
      test(`${spec.name} ${transport} failure is transient, sanitized and never retried`, async () => {
        const calls = interceptFetch(() => {
          throw transport === 'timeout' ? new DOMException(RAW_ERROR, 'TimeoutError') : Object.assign(new Error(RAW_ERROR), { code: 'ECONNRESET' });
        });
        await assert.rejects(instance(spec).complete(TEXT), isProviderError(spec.name, 'network_or_timeout', true));
        assert.equal(calls.length, 1);
      });
    }

    test(`${spec.name} malformed HTTP JSON at 200 is terminal without fallback`, async () => {
      const calls = interceptFetch(() => new Response('{broken SECRET_UPSTREAM', { headers: { 'Content-Type': 'application/json' } }));
      const backup = fakeProvider('backup');
      await assert.rejects(routerFor([instance(spec), backup]).complete(JSON_REQUEST), isProviderError(spec.name, 'invalid_response_or_configuration'));
      assert.equal(calls.length, 1);
      assert.equal(backup.calls.length, 0);
    });

    test(`${spec.name} malformed planned JSON text at 200 is left to the caller, never fallback`, async () => {
      const calls = interceptFetch(() => jsonResponse(output(spec, '{broken')));
      const backup = fakeProvider('backup');
      assert.equal((await routerFor([instance(spec), backup]).complete(JSON_REQUEST)).text, '{broken');
      assert.equal(calls.length, 1);
      assert.equal(backup.calls.length, 0);
    });

    for (const [text, finish, reason] of [
      ['', undefined, 'empty_response'], ['<think>SECRET_THOUGHT</think>', undefined, 'empty_response'],
      ['partial', spec.name === 'google' ? 'MAX_TOKENS' : 'length', 'output_limit'],
      ['blocked', spec.name === 'google' ? 'SAFETY' : 'content_filter', 'response_blocked'],
    ]) {
      test(`${spec.name} rejects ${reason} (${String(finish ?? text)}) without fallback`, async () => {
        const calls = interceptFetch(() => jsonResponse(output(spec, text, finish)));
        const backup = fakeProvider('backup');
        await assert.rejects(routerFor([instance(spec), backup]).complete(TEXT), isProviderError(spec.name, reason));
        assert.equal(calls.length, 1);
        assert.equal(backup.calls.length, 0);
      });
    }
  }

  for (const spec of PROVIDERS.filter(spec => spec.name !== 'google' && spec.name !== 'groq')) {
    test(`${spec.name} multimodal JSON preserves remote and inline images with the real SDK`, async () => {
      const images = [{ url: IMAGE }, { url: 'https://storage.example/file?signature=SECRET_SIGNED_URL' }];
      const calls = interceptFetch(() => jsonResponse(output(spec, '{"vin":"fixture"}')));
      const response = await instance(spec).analyzeImages({ ...VISION, images });
      assert.equal(response.model, 'actual-deployed-model');
      assert.equal(response.responseId, 'actual-response-id');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, spec.endpoint);
      assert.deepEqual(calls[0].body.messages[1].content, [
        { type: 'text', text: TEXT.userPrompt }, ...images.map(image => ({ type: 'image_url', image_url: image })),
      ]);
      assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
      assert.equal(calls[0].body.max_tokens, 4096);
    });

    test(`${spec.name} empty images are terminal without transport`, async () => {
      await assert.rejects(instance(spec).analyzeImages({ ...VISION, images: [] }), isProviderError(spec.name, 'missing_images'));
    });

    test(`${spec.name} embedded 200 rate-limit errors fall back exactly once`, async () => {
      const calls = interceptFetch(() => jsonResponse({ error: { code: 429, message: RAW_ERROR } }));
      const backup = fakeProvider('backup');
      assert.deepEqual(await routerFor([instance(spec), backup]).complete(TEXT), result('backup'));
      assert.equal(calls.length, 1);
      assert.equal(backup.calls.length, 1);
    });

    test(`${spec.name} embedded 200 configuration errors never fall back`, async () => {
      const calls = interceptFetch(() => jsonResponse({ error: { code: 400, message: RAW_ERROR } }));
      const backup = fakeProvider('backup');
      await assert.rejects(routerFor([instance(spec), backup]).complete(TEXT), isProviderError(spec.name, 'http_400', false, 400));
      assert.equal(calls.length, 1);
      assert.equal(backup.calls.length, 0);
    });
  }

  test('Groq explicitly rejects vision without making an SDK request', async () => {
    await assert.rejects(instance(PROVIDERS[1]).analyzeImages(VISION), isProviderError('groq', 'unsupported_vision'));
  });

  test('Google converts PNG, JPEG and WebP data URLs to native inlineData in one call', async () => {
    const calls = interceptFetch(() => jsonResponse(output(PROVIDERS[0], '{"answer":"ok"}')));
    const images = ['png', 'jpeg', 'webp'].map(type => ({ url: `data:image/${type};base64,aW1hZ2U=` }));
    const response = await instance(PROVIDERS[0]).analyzeImages({ ...VISION, images });
    assert.equal(response.model, 'actual-deployed-model');
    assert.equal(response.responseId, 'actual-response-id');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body.contents[0].parts, [
      { text: TEXT.userPrompt }, ...['png', 'jpeg', 'webp'].map(type => ({ inlineData: { mimeType: `image/${type}`, data: 'aW1hZ2U=' } })),
    ]);
    assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
    assert.equal(calls[0].body.generationConfig.maxOutputTokens, 4096);
  });

  test('Google downloads only signed B2 origin URLs and never forwards their signature or API key', async () => {
    const endpoint = 'https://s3.us-west-004.backblazeb2.com';
    const signed = `${endpoint}/bucket/document.png?X-Amz-Signature=SECRET_SIGNED_URL`;
    const bytes = Buffer.from('downloaded fixture');
    const calls = interceptFetch(call => call.method === 'GET'
      ? new Response(bytes, { headers: { 'Content-Type': 'image/png; charset=binary' } })
      : jsonResponse(output(PROVIDERS[0])));
    await instance(PROVIDERS[0], { B2_S3_ENDPOINT: endpoint }).analyzeImages({ ...VISION, images: [{ url: signed }] });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, signed);
    assert.equal(calls[0].redirect, 'error');
    assert.equal(calls[0].headers.get('x-goog-api-key'), null);
    assert.equal(calls[0].headers.get('authorization'), null);
    assert.equal(calls[1].url, PROVIDERS[0].endpoint);
    assert.deepEqual(calls[1].body.contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } });
    assert.doesNotMatch(JSON.stringify(calls[1].body), /SECRET_SIGNED_URL|X-Amz|backblazeb2/);
  });

  for (const url of [
    'http://storage.example/file.png', 'https://other.example/file.png',
    'https://storage.example.evil.test/file.png', 'https://sub.storage.example/file.png',
    'https://storage.example:8443/file.png', 'https://user:SECRET_API_KEY@storage.example/file.png',
    'file:///private.png', 'not a URL', 'data:image/gif;base64,aW1hZ2U=',
    'data:application/pdf;base64,aW1hZ2U=', 'data:image/png;base64,', 'data:image/png;base64,!!!',
  ]) {
    test(`Google rejects unsafe or unsupported image URL ${url}`, async () => {
      const provider = instance(PROVIDERS[0], { B2_S3_ENDPOINT: 'https://storage.example' });
      await assert.rejects(provider.analyzeImages({ ...VISION, images: [{ url }] }), isProviderError('google', 'image_input_unavailable'));
    });
  }

  test('Google remote images require a configured B2 allowlist origin', async () => {
    await assert.rejects(instance(PROVIDERS[0]).analyzeImages({ ...VISION, images: [{ url: 'https://storage.example/file.png' }] }),
      isProviderError('google', 'image_input_unavailable'));
  });

  for (const [label, download] of [
    ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://other.example/private' } })],
    ['HTTP failure', () => new Response(RAW_ERROR, { status: 503 })],
    ['unsupported MIME', () => new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } })],
    ['missing MIME', () => new Response(new Uint8Array([1]))],
    ['oversized declared length', () => new Response('x', { headers: { 'Content-Type': 'image/png', 'Content-Length': '19000001' } })],
    ['missing body', () => new Response(null, { headers: { 'Content-Type': 'image/png' } })],
    ['network failure', () => { throw new Error(RAW_ERROR); }],
  ]) {
    test(`Google B2 ${label} fails safely without retry or provider fallback`, async () => {
      const calls = interceptFetch(download);
      const provider = instance(PROVIDERS[0], { B2_S3_ENDPOINT: 'https://storage.example' });
      const backup = fakeProvider('backup');
      await assert.rejects(routerFor([provider, backup]).analyzeImages({ ...VISION, images: [{ url: 'https://storage.example/file.png' }] }),
        isProviderError('google', 'image_input_unavailable'));
      assert.equal(calls.length, 1);
      assert.equal(backup.calls.length, 0);
    });
  }

  test('Google enforces streamed image size even without Content-Length', async () => {
    const chunk = new Uint8Array(10_000_000);
    const calls = interceptFetch(() => new Response(new ReadableStream({
      start(controller) { controller.enqueue(chunk); controller.enqueue(chunk); controller.close(); },
    }), { headers: { 'Content-Type': 'image/png' } }));
    await assert.rejects(instance(PROVIDERS[0], { B2_S3_ENDPOINT: 'https://storage.example' }).analyzeImages({
      ...VISION, images: [{ url: 'https://storage.example/file.png' }],
    }), isProviderError('google', 'image_input_unavailable'));
    assert.equal(calls.length, 1);
  });

  test('Google enforces the aggregate inline image limit before provider traffic', async () => {
    const url = `data:image/png;base64,${'A'.repeat(13_000_004)}`;
    await assert.rejects(instance(PROVIDERS[0]).analyzeImages({ ...VISION, images: [{ url }, { url }] }),
      isProviderError('google', 'image_input_too_large'));
  });

  test('Google empty images never reach storage or generation', async () => {
    await assert.rejects(instance(PROVIDERS[0]).analyzeImages({ ...VISION, images: [] }), isProviderError('google', 'missing_images'));
  });

  for (const model of [undefined, '', 'false', 'openrouter/auto', 'vendor/paid']) {
    test(`OpenRouter emergency routing is disabled for ${String(model)}`, () => {
      assert.deepEqual(instance(PROVIDERS[4], { OPENROUTER_EMERGENCY_MODEL: model }).emergencyProviders(), []);
    });
  }

  test('OpenRouter emergency inherits both credential and privacy gates', async () => {
    for (const overrides of [{ OPENROUTER_API_KEY: undefined }, { OPENROUTER_DATA_POLICY_APPROVED: undefined }]) {
      const provider = instance(PROVIDERS[4], { ...overrides, OPENROUTER_EMERGENCY_MODEL: 'openrouter/free' });
      const [emergency] = provider.emergencyProviders();
      assert.equal(emergency.configured, false);
      await assert.rejects(routerFor([provider, emergency]).complete(TEXT), error => error.getResponse().code === 'AI_NO_COMPATIBLE_PROVIDER');
    }
  });

  test('explicit OpenRouter emergency runs last with free-only policy and actual response identity', async () => {
    const provider = instance(PROVIDERS[4], { OPENROUTER_EMERGENCY_MODEL: 'openrouter/free' });
    const calls = interceptFetch((call, index) => index === 0
      ? jsonResponse({ error: { message: RAW_ERROR } }, 429)
      : jsonResponse(output(PROVIDERS[4])));
    const response = await routerFor([provider, ...provider.emergencyProviders()]).complete(JSON_REQUEST);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call.body.model), [PROVIDERS[4].model, 'openrouter/free']);
    assert.deepEqual(calls[1].body.provider, calls[0].body.provider);
    assert.equal(calls[1].body.provider.allow_fallbacks, false);
    assert.deepEqual(calls[1].body.provider.max_price, { prompt: 0, completion: 0, request: 0, image: 0 });
    assert.deepEqual(response, { provider: 'openrouter', model: 'actual-deployed-model', responseId: 'actual-response-id', text: 'Final answer' });
  });

  test('providerError bounds cyclic causes, rejects unclassified errors and never retains raw error objects', () => {
    const cyclic = { message: RAW_ERROR }; cyclic.cause = cyclic;
    for (const raw of [undefined, null, RAW_ERROR, new Error(RAW_ERROR), { status: '429', message: RAW_ERROR }, cyclic]) {
      isProviderError('fixture', 'invalid_response_or_configuration')(providerError('fixture', raw));
    }
    const typed = new AiProviderError('fixture', 'http_429', true, 429);
    assert.equal(providerError('fixture', typed), typed);
    const statusWins = providerError('fixture', { status: 401, name: 'APIConnectionError', cause: { code: 'ETIMEDOUT' }, message: RAW_ERROR });
    isProviderError('fixture', 'http_401', false, 401)(statusWins);
  });

  test('finalText trims reasoning and rejects non-final responses without exposing content', () => {
    assert.equal(finalText('fixture', ' <THINK>SECRET_THOUGHT</THINK> Final answer ', 'STOP'), 'Final answer');
    for (const text of [null, undefined, '', '  ', '<think>SECRET_THOUGHT</think>']) {
      assert.throws(() => finalText('fixture', text), isProviderError('fixture', 'empty_response'));
    }
    for (const finish of ['MAX_TOKENS', 'length']) assert.throws(() => finalText('fixture', RAW_ERROR, finish), isProviderError('fixture', 'output_limit'));
    assert.throws(() => finalText('fixture', RAW_ERROR, 'tool_calls'), isProviderError('fixture', 'response_blocked'));
  });
});
