// Versão do código em execução: o commit publicado pela Railway (sete primeiros caracteres) ou APP_VERSION.
// Vai junto das exceções, dos eventos do servidor e das rotinas agendadas, para um alerta apontar "quebrou no deploy X".
export function appVersion(env: NodeJS.ProcessEnv = process.env) {
  const explicit = env.APP_VERSION?.trim();
  if (explicit) return explicit.slice(0, 40);
  const commit = env.RAILWAY_GIT_COMMIT_SHA?.trim();
  return commit ? commit.slice(0, 7) : 'dev';
}
