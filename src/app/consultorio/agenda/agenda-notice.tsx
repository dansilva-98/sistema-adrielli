import type { AgendaActionState } from "@/modules/clinic/form-state";

export function AgendaNotice({ state }: { state: AgendaActionState }) {
  if (!state.message && state.conflicts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {state.message ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "text-sm text-support" : "text-sm text-danger"}
        >
          {state.message}
        </p>
      ) : null}
      {state.conflicts.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {state.conflicts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
