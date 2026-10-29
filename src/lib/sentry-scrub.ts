const SENSITIVE_WORDS = new Set([
  "email",
  "phone",
  "token",
  "password",
  "cpf",
  "code",
  "senha",
  "telefone",
]);

const SENSITIVE_KEYS = new Set([
  "fullname",
  "preferredname",
  "originalname",
  "birthdate",
  "addresstext",
  "school",
  "schoolgrade",
  "notes",
  "guardian",
  "guardians",
]);

const DROPPED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SENSITIVE_KEYS.has(normalized)) return true;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((word) => SENSITIVE_WORDS.has(word));
}

function stripUrl(url: string): string {
  const query = url.indexOf("?");
  const hash = url.indexOf("#");
  const cuts = [query, hash].filter((index) => index >= 0);
  if (cuts.length === 0) return url;
  return url.slice(0, Math.min(...cuts));
}

function dropSensitiveQuery(value: string): string {
  return value.replace(/[^\s"'<>]+/g, (chunk) => {
    const queryAt = chunk.indexOf("?");
    if (queryAt < 0) return chunk;
    const hashAt = chunk.indexOf("#");
    const end = hashAt > queryAt ? hashAt : chunk.length;
    const query = chunk.slice(queryAt + 1, end);
    if (!/(^|&)(?:token|secao)=/i.test(query)) return chunk;
    const params = new URLSearchParams(query);
    for (const key of [...params.keys()]) {
      if (/^(?:token|secao)$/i.test(key)) params.delete(key);
    }
    const rest = params.toString();
    const hash = hashAt > queryAt ? chunk.slice(hashAt) : "";
    return rest
      ? `${chunk.slice(0, queryAt)}?${rest}${hash}`
      : `${chunk.slice(0, queryAt)}${hash}`;
  });
}

function scrubString(value: string): string {
  const withoutSecrets = value
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]");
  return dropSensitiveQuery(
    withoutSecrets.replace(/https?:\/\/[^\s'"]+/gi, (url) => stripUrl(url)),
  );
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => scrubValue(item));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? scrubString(value) : value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    output[key] = scrubValue(child);
  }
  return output;
}

function scrubRequest(request: Record<string, unknown>): void {
  delete request.data;
  delete request.cookies;
  delete request.query_string;
  delete request.env;
  if (typeof request.url === "string") request.url = stripUrl(request.url);

  if (!request.headers || typeof request.headers !== "object") return;
  const headers = request.headers as Record<string, unknown>;
  for (const key of Object.keys(headers)) {
    if (DROPPED_HEADERS.has(key.toLowerCase()) || isSensitiveKey(key)) {
      delete headers[key];
    }
  }
}

export function scrubSentryEvent<T>(event: T): T {
  const cloned = structuredClone(event) as T;
  if (cloned && typeof cloned === "object" && "request" in cloned) {
    const request = (cloned as { request?: unknown }).request;
    if (request && typeof request === "object") {
      scrubRequest(request as Record<string, unknown>);
    }
  }
  return scrubValue(cloned) as T;
}
