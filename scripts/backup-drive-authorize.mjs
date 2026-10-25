import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import {
  BACKUP_FOLDER_NAME,
  DRIVE_FILE_SCOPE,
  assertDriveScope,
  assertFolderId,
  backupFolderMetadata,
  buildConsentUrl,
} from "./production-backup-lib.mjs";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} ausente. Defina no ambiente, não no repositório.`);
  }
  return value;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Resposta do Google inválida.");
  }
}

export async function exchangeAuthCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Autorização do Drive falhou (${response.status}).`);
  }
  const payload = await readJson(response);
  if (!payload.scope) throw new Error("Autorização do Drive falhou.");
  assertDriveScope(payload.scope);
  if (typeof payload.refresh_token !== "string" || payload.refresh_token.length < 10) {
    throw new Error("O Google não devolveu refresh token. Autorize de novo.");
  }
  if (typeof payload.access_token !== "string" || payload.access_token.length < 10) {
    throw new Error("Autorização do Drive falhou.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export async function ensureBackupFolder({ accessToken, fetchImpl = fetch }) {
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${BACKUP_FOLDER_NAME}'`,
    "trashed = false",
  ].join(" and ");
  const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("pageSize", "10");
  const listed = await fetchImpl(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!listed.ok) throw new Error(`Pasta do Drive falhou (${listed.status}).`);
  const payload = await readJson(listed);
  const folders = Array.isArray(payload.files) ? payload.files : [];
  if (folders.length > 1) {
    throw new Error(
      "Há mais de uma pasta adrielli-flores-backups deste aplicativo. Nada foi criado.",
    );
  }
  if (folders.length === 1) {
    assertFolderId(folders[0].id);
    return folders[0].id;
  }
  const created = await fetchImpl(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backupFolderMetadata()),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!created.ok) throw new Error(`Pasta do Drive falhou (${created.status}).`);
  const folder = await readJson(created);
  if (folder.name !== BACKUP_FOLDER_NAME) {
    throw new Error("A pasta criada não é a pasta de backup.");
  }
  assertFolderId(folder.id);
  return folder.id;
}

function waitForCode(server, redirectUri, state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        reject(new Error("Autorização expirada."));
      },
      5 * 60 * 1000,
    );
    server.on("request", (req, res) => {
      clearTimeout(timer);
      const url = new URL(req.url ?? "/", redirectUri);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Autorização recebida. Pode fechar esta janela.");
      if (url.searchParams.get("state") !== state) {
        reject(new Error("Estado OAuth não confere."));
        return;
      }
      if (url.searchParams.get("error")) {
        reject(new Error("Autorização recusada."));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        reject(new Error("Autorização sem código."));
        return;
      }
      resolve(code);
    });
  });
}

async function authorize() {
  const clientId = requireEnv("BACKUP_DRIVE_CLIENT_ID");
  const clientSecret = requireEnv("BACKUP_DRIVE_CLIENT_SECRET");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Autorização do Drive falhou.");
  }
  const redirectUri = `http://127.0.0.1:${address.port}/`;
  const authUrl = buildConsentUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });
  if (authUrl.searchParams.get("scope") !== DRIVE_FILE_SCOPE) {
    server.close();
    throw new Error("Escopo do Drive recusado.");
  }
  console.log("Abra este endereço na conta Google que vai guardar os backups:");
  console.log(authUrl.toString());
  try {
    const code = await waitForCode(server, redirectUri, state);
    const tokens = await exchangeAuthCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: verifier,
    });
    const folderId = await ensureBackupFolder({ accessToken: tokens.accessToken });
    console.log("");
    console.log("Pasta: adrielli-flores-backups");
    console.log(`BACKUP_DRIVE_FOLDER_ID=${folderId}`);
    console.log("");
    console.log(
      "Copie o refresh token para o segredo BACKUP_DRIVE_REFRESH_TOKEN do ambiente GitHub backup.",
    );
    console.log("Não grave o token em arquivo do repositório e feche este terminal.");
    console.log("");
    console.log(tokens.refreshToken);
  } finally {
    server.close();
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("backup-drive-authorize.mjs")) {
  authorize()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : "Autorização do Drive falhou.";
      console.error(message);
      process.exit(1);
    });
}
