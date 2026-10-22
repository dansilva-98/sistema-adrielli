"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="bg-surface font-sans text-text">
        <main className="mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 py-16">
          <h1 className="font-serif text-3xl">Algo deu errado</h1>
          <p>Não foi possível concluir esta ação. Tente novamente.</p>
          <button
            type="button"
            className="w-fit rounded-md bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => reset()}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
