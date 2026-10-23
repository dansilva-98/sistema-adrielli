export function normalizeDatabaseUrl(raw) {
  const value = stripWrapping(raw.trim().replace(/^\uFEFF/, ""));
  return parseUrl(value) ?? rebuildUrl(value);
}

export function describeDatabaseUrl(raw) {
  const value = raw.trim();
  const quotes = /^['"]/.test(value) || /['"]$/.test(value);
  const space = /\s/.test(value);
  const scheme = /^postgres(?:ql)?:\/\//.test(stripWrapping(value));
  const at = (value.match(/@/g) ?? []).length;
  return `esquema=${scheme} aspas=${quotes} espaco=${space} arrobas=${at}`;
}

function stripWrapping(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function rebuildUrl(value) {
  const scheme = value.match(/^(postgres(?:ql)?:\/\/)/);
  if (!scheme) return null;
  const at = value.lastIndexOf("@");
  if (at <= scheme[0].length) return null;
  const userinfo = value.slice(scheme[0].length, at);
  const rest = value.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon <= 0 || !rest) return null;
  const user = userinfo.slice(0, colon);
  const password = userinfo.slice(colon + 1);
  if (!password) return null;
  return parseUrl(
    `${scheme[0]}${encodeURIComponent(user)}:${encodeURIComponent(password)}@${rest}`,
  );
}
