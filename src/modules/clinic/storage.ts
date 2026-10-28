import "server-only";

const BUCKET = "clinic-private";

export type SignedUpload = {
  signedUrl: string;
  token: string;
};

export type ClinicObjectStore = {
  createUpload(path: string): Promise<SignedUpload>;
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(path: string): Promise<void>;
  signedDownload(path: string, seconds: number): Promise<string>;
};

type StorageConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function storageUrl(config: StorageConfig, suffix: string): URL {
  return new URL(`/storage/v1/${suffix.replace(/^\//, "")}`, config.supabaseUrl);
}

function headers(config: StorageConfig, extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  result.set("Authorization", `Bearer ${config.serviceRoleKey}`);
  result.set("apikey", config.serviceRoleKey);
  return result;
}

async function missingObject(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  const text = await response.text();
  return text.includes("NoSuchKey") || text.includes('"not_found"');
}

function absoluteStorageUrl(config: StorageConfig, value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const relative = value.startsWith("/storage/v1/")
    ? value.slice("/storage/v1/".length)
    : value.replace(/^\//, "");
  return storageUrl(config, relative).toString();
}

export function clinicObjectStore(config: StorageConfig): ClinicObjectStore {
  return {
    async createUpload(path) {
      const response = await fetch(
        storageUrl(config, `object/upload/sign/${BUCKET}/${encodedPath(path)}`),
        {
          method: "POST",
          headers: headers(config, { "Content-Type": "application/json" }),
          body: "{}",
        },
      );
      if (!response.ok) throw new Error("Falha ao preparar o envio.");
      const body = (await response.json()) as { url?: string; token?: string };
      if (!body.url) throw new Error("Falha ao preparar o envio.");
      const signedUrl = absoluteStorageUrl(config, body.url);
      const token = body.token ?? new URL(signedUrl).searchParams.get("token") ?? "";
      if (!token) throw new Error("Falha ao preparar o envio.");
      return { signedUrl, token };
    },
    async read(path) {
      const response = await fetch(
        storageUrl(config, `object/${BUCKET}/${encodedPath(path)}`),
        { headers: headers(config) },
      );
      if (response.status === 404 || (await missingObject(response))) return null;
      if (!response.ok)
        throw new Error(`Falha ao ler o arquivo (HTTP ${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async write(path, bytes, mime) {
      const response = await fetch(
        storageUrl(config, `object/${BUCKET}/${encodedPath(path)}`),
        {
          method: "PUT",
          headers: headers(config, { "Content-Type": mime, "x-upsert": "true" }),
          body: new Uint8Array(bytes),
        },
      );
      if (!response.ok) throw new Error("Falha ao guardar o arquivo.");
    },
    async remove(path) {
      const response = await fetch(
        storageUrl(config, `object/${BUCKET}/${encodedPath(path)}`),
        { method: "DELETE", headers: headers(config) },
      );
      if (!response.ok && response.status !== 404 && !(await missingObject(response))) {
        throw new Error(`Falha ao apagar o arquivo (HTTP ${response.status}).`);
      }
    },
    async signedDownload(path, seconds) {
      const response = await fetch(
        storageUrl(config, `object/sign/${BUCKET}/${encodedPath(path)}`),
        {
          method: "POST",
          headers: headers(config, { "Content-Type": "application/json" }),
          body: JSON.stringify({ expiresIn: seconds }),
        },
      );
      if (!response.ok) throw new Error("Falha ao abrir o arquivo.");
      const body = (await response.json()) as { signedURL?: string; signedUrl?: string };
      const signed = body.signedURL ?? body.signedUrl;
      if (!signed) throw new Error("Falha ao abrir o arquivo.");
      return absoluteStorageUrl(config, signed);
    },
  };
}
