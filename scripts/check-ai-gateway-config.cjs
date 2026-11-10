require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { GoogleProvider } = require('../dist/common/ai-gateway/providers/google.provider');
const { GroqProvider } = require('../dist/common/ai-gateway/providers/groq.provider');
const { NvidiaProvider } = require('../dist/common/ai-gateway/providers/nvidia.provider');
const { CloudflareProvider } = require('../dist/common/ai-gateway/providers/cloudflare.provider');
const { OpenRouterProvider } = require('../dist/common/ai-gateway/providers/openrouter.provider');
const { createAiProviderChain } = require('../dist/common/ai-gateway/ai-gateway.module');

function configuration() {
  const file = path.resolve(__dirname, '../.env');
  const values = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  return { get: key => process.env[key] ?? values[key] };
}

function cloudflarePlan(subscriptions) {
  if (!Array.isArray(subscriptions)) return 'unverified';
  const plans = subscriptions.map(item => [item.rate_plan?.id, item.rate_plan?.public_name, item.rate_plan?.name].filter(Boolean).join(' ').toLowerCase());
  if (plans.some(plan => /workers/.test(plan) && /paid|standard|bundled|unbound/.test(plan))) return 'paid';
  if (plans.some(plan => /workers/.test(plan) && /free/.test(plan))) return 'free';
  return 'unverified';
}

function snapshot(config) {
  const google = new GoogleProvider(config), groq = new GroqProvider(config), nvidia = new NvidiaProvider(config);
  const cloudflare = new CloudflareProvider(config), openrouter = new OpenRouterProvider(config);
  const chain = createAiProviderChain(google, groq, openrouter, nvidia, cloudflare);
  return {
    providers: chain.map(provider => ({ provider: provider.providerName, active: provider.configured,
      reason: provider.unavailableReason, capabilities: provider.capabilities })),
    textOrder: chain.filter(p => p.configured && p.capabilities.text).map(p => p.providerName),
    visionOrder: chain.filter(p => p.configured && p.capabilities.vision).map(p => p.providerName),
  };
}

async function getMetadata(url, headers = {}) {
  try {
    const response = await fetch(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) { await response.body?.cancel().catch(() => {}); return { status: response.status }; }
    return { status: response.status, body: await response.json() };
  } catch { return { status: null, error: 'metadata_unavailable' }; }
}

async function checkAccess(config) {
  const value = (key, fallback = '') => config.get(key)?.trim() || fallback;
  const checks = [];
  const googleKey = value('GOOGLE_API_KEY') || value('GEMINI_API_KEY');
  if (googleKey) {
    const result = await getMetadata('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash', { 'x-goog-api-key': googleKey });
    checks.push({ provider: 'google', status: result.status, modelVisible: result.body?.name === 'models/gemini-3.8-flash' });
  }
  if (value('GROQ_API_KEY')) {
    const result = await getMetadata('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${value('GROQ_API_KEY')}` });
    checks.push({ provider: 'groq', status: result.status, modelVisible: result.body?.data?.some(item => item.id === 'openai/gpt-oss-120b') === true });
  }
  if (value('NVIDIA_API_KEY')) {
    const result = await getMetadata('https://integrate.api.nvidia.com/v1/models', { Authorization: `Bearer ${value('NVIDIA_API_KEY')}` });
    checks.push({ provider: 'nvidia', status: result.status, modelVisible: result.body?.data?.some(item => item.id === 'nvidia/nemotron-3.5-super-vl-120b-a12b') === true });
  }
  if (value('CLOUDFLARE_API_TOKEN') && /^[a-f0-9]{32}$/i.test(value('CLOUDFLARE_ACCOUNT_ID'))) {
    const result = await getMetadata(`https://api.cloudflare.com/client/v4/accounts/${value('CLOUDFLARE_ACCOUNT_ID')}/subscriptions`, { Authorization: `Bearer ${value('CLOUDFLARE_API_TOKEN')}` });
    checks.push({ provider: 'cloudflare', check: 'workers_plan', status: result.status, workersPlan: result.body?.success === true ? cloudflarePlan(result.body.result) : 'unverified' });
    const models = await getMetadata(`https://api.cloudflare.com/client/v4/accounts/${value('CLOUDFLARE_ACCOUNT_ID')}/ai/models/search?search=qwen3.8-27b`, { Authorization: `Bearer ${value('CLOUDFLARE_API_TOKEN')}` });
    checks.push({ provider: 'cloudflare', check: 'model_catalog', status: models.status,
      modelVisible: models.body?.success === true && Array.isArray(models.body.result) && models.body.result.some(item => item.name === '@cf/qwen/qwen3.8-27b') });
  }
  if (value('OPENROUTER_API_KEY')) {
    const result = await getMetadata('https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${value('OPENROUTER_API_KEY')}` });
    checks.push({ provider: 'openrouter', status: result.status, freeTier: result.body?.data?.is_free_tier === true });
    const catalog = await getMetadata('https://openrouter.ai/api/v1/models');
    const model = catalog.body?.data?.find(item => item.id === 'nvidia/nemotron-3.5-super-vl:free');
    checks.push({ provider: 'openrouter-catalog', status: catalog.status, modelVisible: !!model,
      zeroTokenPrice: !!model?.pricing && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0 });
  }
  return checks;
}

module.exports = { configuration, snapshot, checkAccess, cloudflarePlan };
if (require.main === module) {
  (async () => {
    const config = configuration();
    const report = snapshot(config);
    if (process.argv.includes('--check-access')) report.access = await checkAccess(config);
    console.log(JSON.stringify({ ...report, inferencePerformed: false, productionMutation: false }, null, 2));
  })().catch(() => { console.log(JSON.stringify({ error: 'configuration_check_failed', inferencePerformed: false })); process.exitCode = 1; });
}
