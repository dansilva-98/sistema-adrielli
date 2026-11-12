export default function AppointmentLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p>Carregando a sessão…</p>
      <div className="h-11 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
    </div>
  );
}
