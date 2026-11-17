"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  idleCalendarFeedAction,
  type CalendarFeedActionState,
} from "@/modules/clinic/form-state";
import { rotateCalendarFeedAction } from "@/modules/clinic/server/agenda-actions";

function IphoneSteps() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        No iPhone: Ajustes → Calendário → Contas → Adicionar conta → Outra → Calendário
        assinado. Cole o link.
      </p>
      <p className="text-muted">
        O calendário avisa 1 hora antes. O iPhone pode ignorar alarmes de calendários
        assinados (opção &quot;Remover alertas&quot;). Depois de assinar, abra o
        calendário, toque nesta conta e deixe os alertas ligados. Se o aviso não aparecer,
        use o lembrete do próprio calendário do iPhone.
      </p>
    </div>
  );
}

function FeedLink({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <label className="text-sm font-medium" htmlFor="calendar-feed-url">
        Link do calendário
      </label>
      <Input id="calendar-feed-url" readOnly value={url} className="h-11 text-base" />
      <p className="text-sm text-muted">Copie agora. Este link não aparece de novo.</p>
      <IphoneSteps />
    </div>
  );
}

function RotateConfirm({
  pending,
  state,
  action,
  onCancel,
}: {
  pending: boolean;
  state: CalendarFeedActionState;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <input type="hidden" name="confirm" value="sim" />
      <p className="text-sm">O link atual deixa de funcionar. Trocar mesmo assim?</p>
      {state.message && !state.feedUrl ? (
        <p className="text-sm">{state.message}</p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Confirmar
      </Button>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={onCancel}>
        Voltar
      </Button>
    </form>
  );
}

export function CalendarFeedPanel({ hasFeed }: { hasFeed: boolean }) {
  const [state, action, pending] = useActionState(
    rotateCalendarFeedAction,
    idleCalendarFeedAction,
  );
  const [confirming, setConfirming] = useState(false);
  const [seenUrl, setSeenUrl] = useState(state.feedUrl);
  const activeFeed = hasFeed || Boolean(state.feedUrl);
  if (state.feedUrl !== seenUrl) {
    setSeenUrl(state.feedUrl);
    setConfirming(false);
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="font-serif text-xl">Calendário do iPhone</h3>
      {state.feedUrl ? <FeedLink url={state.feedUrl} /> : null}
      {!state.feedUrl && hasFeed ? (
        <p className="text-sm text-muted">
          Um link já foi gerado. Trocar invalida o anterior.
        </p>
      ) : null}
      {!activeFeed ? (
        <form action={action}>
          {state.message ? <p className="mb-2 text-sm">{state.message}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            Gerar link do calendário
          </Button>
        </form>
      ) : null}
      {activeFeed && !confirming ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          Trocar link
        </Button>
      ) : null}
      {activeFeed && confirming ? (
        <RotateConfirm
          pending={pending}
          state={state}
          action={action}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  );
}
