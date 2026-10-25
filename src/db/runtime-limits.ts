/** O Supavisor fecha a conexão ociosa do pool depois de 5 minutos. */
export const POOLER_IDLE_TIMEOUT_SECONDS = 5 * 60;

export const RUNTIME_MAX_LIFETIME_SECONDS = POOLER_IDLE_TIMEOUT_SECONDS - 60;

export const RUNTIME_STATEMENT_TIMEOUT_MS = 10_000;
