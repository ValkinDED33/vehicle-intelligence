# AI Gateway Routing And Local Migration Report

Scope: existing IA-CARS assistant/document inference only. Reviewed 2026-11-10.
Code has not been published; no commit, push, deployment, production migration, key creation,
billing change or live inference was performed for this task.
Production Render environment settings were saved with **Save only** at the user's
request. The user will commit/push; the running production code has not changed.

## Architecture Before

```text
Website -> AssistantConversationService -> AssistantService
Telegram -> TelegramConversationService -> AssistantConversationService -> AssistantService
Documents -> DocumentAnalysisService -> DocumentVisionService
    -> AiGatewayService -> AI_PROVIDER -> GroqProvider
```

There was no fallback. Assistant requests selected `GROQ_ASSISTANT_MODEL`
(default `openai/gpt-oss-120b`); other text and vision used `GROQ_MODEL`.
Assistant requests disabled SDK retries; other requests inherited two SDK retries.
Model settings in the real `.env` were inventoried only as SET/EMPTY/MISSING.
Their values were not printed or changed.

`AssistantService.chat()` builds owned context, generates an answer and runs an
optional proofreading pass. `planTurn()` asks for JSON, parses it and proposes an
action. The server validates and confirms actions; no provider-native tools were
used. Saved-VIN policy answers can bypass inference entirely.

Telegram uses the same assistant, preferences and per-car/language memory as the
website. `/forget`, ownership/revision checks, confirmation checkpoints and account
linking are independent of provider selection. Reminders have deterministic
delivery text and do not call an AI provider when sending notifications.

Document analysis uses a signed B2 image URL, or stored PDF bytes rendered with
pdfjs/canvas into batches of five PNG pages (up to 40 pages). Results go through
the existing parser, normalizer, merge and document-processing lease. Existing
owner-confirmed fields are not replaced by new AI guesses.

## Architecture After

```text
Feature modules (unchanged)
    -> AiGatewayService
    -> AI_PROVIDER
    -> AiProviderRouter
       -> GoogleProvider
       -> GroqProvider (existing adapter, text only)
       -> NvidiaProvider (optional)
       -> CloudflareProvider (optional)
       -> OpenRouterProvider (fixed free model)
       -> optional openrouter/free delegate
```

One `AI_PROVIDER` binding, one central chain factory, no feature-specific routing.
Public `complete()` / `analyzeImages()` requests and
`{provider, model, text, responseId?}` responses are unchanged.
The actual provider/model response is returned; `getProviderName()` identifies
the runtime as `router`. The existing optional proofreading pass can use a
different provider; the chat's provider/model still identifies the primary answer.
`/health` reads gateway configuration without calling any provider, instead of
assuming that every deployment must configure Groq. It does not assert vision
availability, upstream health, sufficient quota or valid credentials.

## Provider Order And Capabilities

Implemented TEXT / JSON order: Google -> Groq -> NVIDIA -> Cloudflare -> OpenRouter
fixed -> optional OpenRouter free router. VISION uses the same order without Groq.
Unconfigured or privacy-blocked providers are skipped, not counted as failures.

| Provider | Verified model default | Text | JSON | Vision | Native tools available / used | Local active |
| --- | --- | --- | --- | --- | --- | --- |
| Google | `gemini-3.8-flash` | Yes | Yes | Yes | Yes / No | Key present; privacy-blocked |
| Groq | `openai/gpt-oss-120b` | Yes | Yes | **No** | Yes / No | Text configured |
| NVIDIA | `nvidia/nemotron-3.5-super-vl-120b-a12b` | Yes | Yes | Yes | Yes / No | Key present; privacy-blocked |
| Cloudflare | `@cf/qwen/qwen3.8-27b` (configured) | Yes | Yes | Yes | Yes / No | Configured; Free plan confirmed by user |
| OpenRouter | `nvidia/nemotron-3.5-super-vl:free` | Yes | Yes | Yes | Yes / No | Configured with privacy/zero-price filters |
| OpenRouter emergency | `openrouter/free` | Yes | Filtered | Filtered | Available / No | Configured as final route |

Initial inventory contained only Groq credentials. On November 10 the user added
existing `GOOGLE_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`,
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OPENROUTER_API_KEY`.
All are SET locally and their names are present in Render. No new key was created.
Secret values were not displayed, changed, compared to Render or committed.
The approved active chain for the prepared backend is now:

```text
TEXT / JSON: Groq -> Cloudflare -> OpenRouter fixed -> OpenRouter free router
VISION:      Cloudflare -> OpenRouter fixed -> OpenRouter free router
```

Google/NVIDIA are implemented and have model access, but are not approved
recipients of the app's personal context under the current free-service terms.
This is intentional privacy gating, not invalid credentials. Their keys remain.
Cloudflare also accepts the previously verified Scout default
`@cf/meta/llama-4-scout-17b-16e-instruct`; the user's existing `CLOUDFLARE_MODEL`
now takes precedence over the older `CLOUDFLARE_AI_MODEL` example alias.
Qwen requests explicitly use low reasoning and `store:false`.

Model overrides are server settings. Preserve `GROQ_MODEL` and
`GROQ_ASSISTANT_MODEL` for their existing text purposes. Other adapters accept
only the verified model(s) above; unknown/paid overrides fail visibly rather than
advertising unverified capabilities or silently substituting a paid model.
After adding new model support, update its capability contract and offline tests.

## Configuration

All implemented variables are in the root `.env.example`, not `frontend/` or
`VITE_*`. Add values to the existing private server environment, not to the
example or browser bundle. Existing secret values were not modified. Only
non-secret approval/plan controls were added to the ignored local `.env` and
the corresponding models, controls and budgets were saved in Render.

Google accepts `GOOGLE_API_KEY` or an already-existing `GEMINI_API_KEY`; do not
create duplicate keys. If both are configured, `GOOGLE_API_KEY` wins.
The new recipients require their `*_DATA_POLICY_APPROVED=true` setting only
**after** applicable data terms, deployment region and the app's privacy coverage
have actually been reviewed. The default is false. This flag is an operator
acknowledgment, not legal permission or a substitute for consent/data agreements.
It covers text too: assistant context contains VINs, plates, history and confirmed
document fields. No automatic content classifier can prove those prompts anonymous.

Cloudflare additionally requires `CLOUDFLARE_FREE_PLAN_CONFIRMED=true` after
checking the existing account's Workers Free plan. Do not enable it for a Paid
account expecting a hard zero-cost guarantee. No Unified Billing headers/gateway,
credit purchase or plan upgrade is configured. NVIDIA remains disabled until its
API-service permission for personal data and allowed deployment use are confirmed.
`NVIDIA_BASE_URL` and `OPENROUTER_BASE_URL` are honored using the user's existing
names, but only their verified HTTPS provider origins are accepted; they cannot
redirect credentials to direct OpenAI or arbitrary hosts.

`OPENROUTER_EMERGENCY_MODEL` is empty by default. Only `openrouter/free` enables
the optional final delegate. OpenRouter documents filtering for images and JSON;
image parts/JSON mode are always sent and `require_parameters=true` prevents
unsupported parameters being dropped. Model choice is otherwise nondeterministic.
Never use this emergency route to bypass the fixed model's 401/403/404 errors.

Defaults are 30 seconds per provider, 2048 output tokens for assistant text,
4096 for new vision adapters; existing Groq general text remains 1000 tokens.
Blank numeric settings use defaults; invalid positive-integer settings are errors.
Timeouts/output limits can be tuned within the validated server bounds.
`AI_GATEWAY_TIMEOUT_MS=60000` bounds **all attempts together**, may be lowered,
and must not exceed 60000. The router forwards one shared abort signal internally;
the public gateway request contracts are unchanged. Expiry cancels the active
REST/SDK request and stops the chain, rather than starting another fallback.

## Fallback And Error Policy

Fallback only: HTTP **408, 429, 500, 502, 503, 504**; SDK connection/timeout
errors; Abort/Timeout errors from the provider transport; network codes
`ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`, `ENOTFOUND`,
`ENETUNREACH`, `EHOSTUNREACH`, `EPIPE`, `UND_ERR_CONNECT_TIMEOUT`,
`UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`, `UND_ERR_SOCKET`.
Google quota/unavailable/deadline responses use the corresponding HTTP statuses.
OpenRouter numeric error envelopes are classified using the same allowlist.
Provider 429 logs explicitly identify quota/rate-limit unavailability.
The installed compatible SDK inherits `.name = "Error"` for some connection,
body-timeout and user-abort classes. Classification therefore also checks actual
SDK class identity, including exceptions without a cause. A stalled response body
is tested with the real SDK and must trigger one fallback, not an opaque 502.

No fallback: 400/401/402/403/404/410/422, invalid model/config/request,
unsupported capabilities, unknown exceptions, safety refusal, empty response,
output truncation, invalid/undesirable JSON, rejected application semantics,
weak wording or hallucination. A successful JSON string reaches the original
application parser unchanged; action validation remains the server's job.

All provider attempts are single-shot. OpenAI-compatible SDK clients and request
options have `maxRetries: 0`; Google REST has no retry loop. OpenRouter disables
upstream fallbacks as well. No sleeps, jitter, background retries or quality-based
fallbacks were added. Optional proofreading and the existing Telegram car-switch
replan remain separate application calls, not router retries. PDF batches are
separate workloads, not retries either. One gateway call has a shared 60-second
maximum by default, independent of the number of routes. Whole turns may involve
proofreading or a vehicle-switch replan, plus domain/database I/O; do not confuse
this inference budget with a hard end-to-end HTTP request timeout.

Exhausted technical chain -> deterministic HTTP 503 `AI_PROVIDERS_UNAVAILABLE`,
with sanitized ordered failures. No eligible provider -> HTTP 503
`AI_NO_COMPATIBLE_PROVIDER`. Configuration/response failures -> HTTP 502
`AI_PROVIDER_ERROR`, preserving a safe reason and upstream status. A provider's
401 is not exposed as the website user's JWT failure. No raw error/cause is
retained. This also keeps document `processingError` safe without changing that
module's persistence behavior. SDK verbose logging and redirects are disabled.
Rejected Google HTTP and B2 download bodies are explicitly cancelled before
falling back or returning an input error, so failed attempts release resources.

## Free-Tier And Privacy Review

| Provider | Free access and quota | Billing / data caveat |
| --- | --- | --- |
| Google | Gemini 3.8 Flash has a limited Free Tier; exact project quotas vary | A billed key can incur charges. Unpaid terms generally permit product improvement/human review and prohibit sensitive/personal input. EEA/CH/UK have special data terms and client-availability restrictions; review applicable terms, do not infer permission from UI language or timezone. |
| Groq | Free plan: GPT-OSS 120B base limits 30 RPM, 1000 RPD, 8000 TPM, 200000 TPD, shared at organization level | Actual account limits/plan may differ. No model-training use under documented inference policy; reliability/abuse retention exceptions and regional transfers still need review. Existing integration preserved. |
| NVIDIA | Free prototype API endpoint / Developer Program, not a production SLA or perpetual free guarantee | Trial terms restrict personal/confidential data unless expressly allowed by the service. No confidential documents should be routed there merely because a trial key exists. |
| Cloudflare | Workers Free: 10000 neurons/day shared allocation, reset at 00:00 UTC; configured Qwen and Scout are not on the current paid-only list | Paid plan can bill beyond the allocation. Standard stateless Workers AI has no training use and limited retention exceptions. Applicable model license and app privacy coverage still matter. |
| OpenRouter | Fixed `:free` endpoint has $0 token pricing; generally 20 RPM/50 RPD without a qualifying credit purchase, including failed attempts | No credit purchase made. Enforce max prompt/completion/request/image price 0, `data_collection: deny`, `require_parameters: true`, no internal fallbacks. Privacy filters may leave no endpoint; do not weaken them to recover availability. |

Google signed image URLs are downloaded only from the configured HTTPS B2 endpoint
or its exact bucket virtual host, without redirects or AI authorization headers.
Only image PNG/JPEG/WebP is accepted by this adapter; inline inputs have the same
types. Download size is bounded to 19 MB per image and inline batch size to
26 million base64 characters before serialization. The complete JSON payload,
including prompts, base64 encoding and metadata, must fit Google's 20 MB limit;
oversized requests fail locally before inference. Arbitrary external/private-network
URLs are not fetched. No persistent File API upload is introduced.
Transport fetch failures are document-input errors, not excuses to send the same
private URL to another provider. Other multimodal adapters send the existing
signed/data URLs only to an approved compatible provider.

## Direct OpenAI

For **this assistant/document routing architecture**:

```text
Direct OpenAI API used: NO
OPENAI_API_KEY required: NO
OpenAI provider: NO
```

The npm `openai` package remains the existing compatible transport for Groq,
NVIDIA, Cloudflare and OpenRouter, never using api.openai.com in this gateway.
The pre-existing dirty working tree independently contains the optional
`src/modules/vehicle-artwork/openai-artwork.provider.ts` and its OpenAI key in
`.env.example`. This is legitimate separate image generation, not an erroneous
assistant migration. It was **preserved, not invoked, enabled, deleted or migrated**.
Do not claim that the entire repository contains no direct OpenAI code.

## Files Changed By This Task

Paths below are relative to the repository; pre-existing dirty files are excluded.

| File | Reason |
| --- | --- |
| `src/common/ai-gateway/ai-provider.interface.ts` | Add opt-in internal capability/config metadata and chain token; public inference interfaces unchanged. |
| `src/common/ai-gateway/ai-provider-router.ts` | Central eligibility filtering, technical-only fallback and safe diagnostics. |
| `src/common/ai-gateway/ai-provider-error.ts` | Safe status/network classification and final-output checks. |
| `src/common/ai-gateway/ai-config.ts` | Small shared trimmed/numeric configuration helpers. |
| `src/common/ai-gateway/ai-gateway.module.ts` | Bind the existing token to router; one shared provider order. |
| `src/common/ai-gateway/ai-gateway.service.ts` | Configuration check for existing health endpoint. |
| `src/common/ai-gateway/providers/groq.provider.ts` | Preserve text/model behavior; disable vision, retries, redirects and raw SDK logging. |
| `src/common/ai-gateway/providers/google.provider.ts` | Optional privacy-gated native REST text/JSON/vision adapter. |
| `src/common/ai-gateway/providers/compatible-chat.ts` | Small common compatible request/response code for three new adapters. |
| `src/common/ai-gateway/providers/nvidia.provider.ts` | Optional verified NIM model, fixed prototype endpoint and data-policy gate. |
| `src/common/ai-gateway/providers/cloudflare.provider.ts` | Optional verified Workers Free-compatible model and plan/privacy gates. |
| `src/common/ai-gateway/providers/openrouter.provider.ts` | Fixed $0 model, zero-price/privacy filters and opt-in emergency delegate. |
| `src/common/health/health.controller.ts` | Stop requiring Groq for a configured gateway; no inference in health checks. |
| `scripts/check-telegram-ai.cjs` | Explicit live diagnostic now uses the real central chain, never Groq-only routing. |
| `scripts/check-ai-gateway-config.cjs` | Safe configuration report; opt-in GET-only model/access/plan metadata checks with no inference or secret output. |
| `test/telegram.test.cjs` | Mock uses the validated Groq origin instead of an arbitrary custom host. |
| `test/ai-gateway.test.cjs` | Offline router, adapter, privacy, capability, error and SDK contracts. |
| `test/ai-integrations.test.cjs` | Real Nest DI, health, assistant planning and actual six-page PDF rendering through gateway. |
| `.env.example` | Document implemented optional configuration; keep independent artwork block. |
| `.env` (ignored) | Only approved non-secret privacy/Free-plan controls were added; credentials are unchanged. |
| `README.md` | Describe actual architecture and operational limits. |
| `docs/telegram-release.md` | Remove obsolete Groq-only/document-vision claims; identify live-test costs. |
| `docs/ai-gateway-routing.md` | Analysis, scope, model/source review, changes, test results and remaining risks. |

No AI-related secrets were found by reference-name search in `frontend/src`.
No frontend, auth, VIN policy, garage, reminder, memory, action confirmation,
database schema or payment logic was changed by this task. Earlier local artwork,
frontend, garage DTO and migration changes remain intact and separate.

## Verification

Baseline: `npm test` passed **152/152** before this modernization.
Final `npm test`: **392/392 passed**, including **226** targeted gateway cases
and **14** integration cases (real Nest DI, assistant planning, actual PDF pages,
shared deadline cancellation). The 152 existing tests still pass, including
Telegram confirmations, shared memory/preferences, `/forget`, account linking,
reminders, owner checks, VIN access and the independently mocked artwork feature.
`npm run build`: **passed** (Nest API, frontend clean install, TypeScript and Vite).
`git diff --check`: **passed**; only existing CRLF normalization warnings.
Lint: **unavailable - no lint script in package.json** (root and frontend).
No lint tool or dependency was added.
`test:telegram:live` is deliberately skipped: it consumes inference quota and
may bill the configured account. Actual generated answer/extraction quality and
inference permission/quota have not been live-verified. Read-only model visibility
does not prove successful generation.

## Access And Render Preparation

GET-only metadata checks used the existing local credentials, with no prompts,
images, inference requests or production database/Telegram writes:

| Check | Result |
| --- | --- |
| Google model metadata | HTTP 200; requested model visible |
| Groq model catalog | HTTP 200; GPT-OSS 120B visible |
| NVIDIA model catalog | HTTP 200; requested Nemotron visible |
| OpenRouter key metadata | HTTP 200; free-tier key |
| OpenRouter public model catalog | HTTP 200; fixed model visible, $0 input/output |
| Cloudflare scoped model catalog | HTTP 200; configured Qwen model visible |
| Cloudflare subscription metadata | HTTP 403; token cannot read account plan |

The user explicitly confirmed **Workers Free without Paid/Unified Billing**;
the plan was not inferred from that 403 or from an empty subscription list.
Do not add token scopes or request a new key just to make this metadata check pass.

Render service `srv-d9u99h61egvs739e0ltg`, project `hw3-crud`, production URL
`https://vehicle-intelligence-o9mi.onrender.com`, was inspected through its signed-in
dashboard. The deployed code is still **d147bf6**, linked to GitHub `main`.
Build is `npm install && npm run build`, start is `npm run start:prod`,
Auto-Deploy is **On Commit**. No service build/start settings were changed.

All six existing AI credential names were present; secret values were kept masked.
**22 non-secret settings** (new models, timeouts, output budgets, privacy controls
and optional free emergency route) were saved with **Save only**. Google/NVIDIA
privacy controls are false; Cloudflare/OpenRouter controls are true; Workers Free
confirmation is true. No deploy/restart was triggered and no old-commit rebuild
was passed off as publishing the new router.

After the user commits/pushes the prepared code, Render's automatic deployment
must finish before these new paths actually serve website and Telegram requests.
No new database migration is required by the gateway. The unrelated pending
artwork migration remains separate and was not applied to production.

No active adapter/model configuration refers to `gpt-5.4-mini`,
`llama-3.3-70b-versatile` or `gemini-2.5-flash`; these names remain only here
as the audit checklist. Historical dated Groq audit observations remain valid
history, not active configuration. No `useExisting:
GroqProvider`, Groq-only binding or direct OpenAI provider was added to the gateway.

## Sources

- [Google model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [GenerateContent REST](https://ai.google.dev/api/generate-content), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [terms](https://ai.google.dev/gemini-api/terms).
- [Groq GPT-OSS input/capabilities](https://console.groq.com/docs/model/openai/gpt-oss-120b), [JSON](https://console.groq.com/docs/structured-outputs), [limits](https://console.groq.com/docs/rate-limits), [data](https://console.groq.com/docs/your-data).
- [NVIDIA model](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b), [API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer), [free prototype FAQ](https://docs.api.nvidia.com/nim/docs/product), [trial terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf).
- [Cloudflare Qwen](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/), [Scout alternative](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/), [pricing and paid-only exclusions](https://developers.cloudflare.com/workers-ai/platform/pricing/), [data](https://developers.cloudflare.com/workers-ai/platform/data-usage/), [compatible API](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/).
- [OpenRouter fixed free model](https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free), [routing price/privacy filters](https://openrouter.ai/docs/guides/routing/provider-selection), [free router capability filtering](https://openrouter.ai/docs/guides/routing/routers/free-router), [free quotas](https://openrouter.ai/collections/free-models).
