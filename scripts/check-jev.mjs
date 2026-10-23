// Executar no serviço a validar. Não carrega .env local e nunca imprime chaves ou erros brutos do SDK.
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';

const expectedIndex = process.argv.indexOf('--expect-environment');
const expected = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
const environment = process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown';
const configured = Boolean(process.env.TYPESAFE_API_KEY?.trim());
const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest';
const configuredTimeout = Number(process.env.JEV_TIMEOUT_MS);
const timeout = Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 8000;
const started = Date.now();
const report = (status, extra = {}) => {
  console.log(JSON.stringify({ check: 'jev', environment, configured, model, status, elapsedMs: Date.now() - started, ...extra }));
  process.exitCode = status === 'available' ? 0 : 1;
};

if (expectedIndex >= 0 && (!expected || expected !== environment)) {
  report('environment_mismatch');
} else if (!configured) {
  report('not_configured');
} else {
  try {
    const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY.trim(), defaultModel: model, timeout, retry: { maxRetries: 0 } });
    // Uma chamada real, sem cache, com dados sintéticos e o mesmo tipo de pergunta usado pelo app.
    const { answers } = await client.systemOne({
      state: { item: 'Panela de cozinha', verificacao: 'disponibilidade do Nino' },
      questions: { ambiente: choice('Em qual ambiente da casa este item é usado?', { Cozinha: null, Quarto: null }) },
    });
    const answer = answers?.ambiente;
    const valid = answer?.type === 'choice' && answer.choice === 'Cozinha'
      && Number.isFinite(answer.confidence) && answer.confidence >= 0.6 && answer.confidence <= 1;
    report(valid ? 'available' : 'invalid_response');
  } catch (error) {
    // O corpo ou a mensagem de erro podem conter dados do provedor. Só o status HTTP é exportado.
    const httpStatus = Number.isInteger(error?.status) ? error.status : undefined;
    report('unavailable', { ...(httpStatus !== undefined ? { httpStatus } : {}) });
  }
}
