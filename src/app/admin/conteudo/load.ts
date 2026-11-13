import { reportServerError } from "@/lib/sentry-server";

export function loadOrNull<T>(load: Promise<T>): Promise<T | null> {
  return load.catch(async (error: unknown) => {
    await reportServerError(error);
    return null;
  });
}

export function isRecordId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
