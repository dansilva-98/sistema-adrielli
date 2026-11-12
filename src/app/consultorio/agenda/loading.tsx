export default function AgendaLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p>Carregando a agenda…</p>
      <div className="h-11 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-28 animate-pulse rounded-xl bg-surface-muted" />
      <div className="h-28 animate-pulse rounded-xl bg-surface-muted" />
    </div>
  );
}
