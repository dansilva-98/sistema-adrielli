export function chooseDraft(deploys) {
  if (!Array.isArray(deploys)) throw new Error("Lista de deploys inválida.");
  const ready = deploys.filter(
    (item) => item && item.state === "ready" && (item.deploy_ssl_url || item.ssl_url),
  );
  const preview = ready.find((item) => item.context === "deploy-preview");
  const draft = preview ?? ready.find((item) => item.published === false);
  if (!draft) throw new Error("Nenhum rascunho pronto.");
  return {
    url: draft.deploy_ssl_url || draft.ssl_url,
    context: typeof draft.context === "string" ? draft.context : "desconhecido",
  };
}

export function summarize(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Medição vazia.");
  }
  const times = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const mid = Math.floor(times.length / 2);
  const median = times.length % 2 === 0 ? (times[mid - 1] + times[mid]) / 2 : times[mid];
  return {
    median,
    worst: times[times.length - 1],
    statuses: [...new Set(samples.map((sample) => sample.status))],
  };
}

export function evidenceText(input) {
  return [
    `Rascunho: ${input.url}`,
    `Contexto: ${input.context}`,
    `Pedidos autenticados: ${input.count}`,
    `Status: ${input.statuses.join(", ")}`,
    `Mediana de /admin: ${input.median.toFixed(1)} ms`,
    `Pior caso: ${input.worst.toFixed(1)} ms`,
    `Usuário de teste removido: ${input.removed ? "sim" : "não"}`,
  ].join("\n");
}
