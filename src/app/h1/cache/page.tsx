import { cacheTag } from "next/cache";

import { bumpStampAction } from "./actions";

export const instant = false;

async function cachedStamp(): Promise<string> {
  "use cache";
  cacheTag("h1-stamp");
  return new Date().toISOString();
}

export default async function H1CachePage() {
  const stamp = await cachedStamp();
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-col gap-4 px-4 py-16">
      <h1 className="text-xl">Cache temporário</h1>
      <p data-testid="h1-stamp">{stamp}</p>
      <form action={bumpStampAction}>
        <button type="submit">Atualizar</button>
      </form>
    </main>
  );
}
