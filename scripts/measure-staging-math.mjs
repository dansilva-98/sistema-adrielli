export function deployField(value) {
  if (typeof value !== "string") return "ausente";
  const cleaned = value.trim().replace(/[^A-Za-z0-9_./-]/g, "");
  if (cleaned.length === 0) return "ausente";
  return cleaned.slice(0, 80);
}

export function publishedField(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "ausente";
}

export function deploySummary(deploys) {
  if (!Array.isArray(deploys)) return "Deploys encontrados: resposta inválida.";
  if (deploys.length === 0) return "Deploys encontrados: nenhum.";
  const lines = deploys.slice(0, 20).map((item, index) => {
    return [
      `${index + 1}.`,
      `state=${deployField(item?.state)}`,
      `context=${deployField(item?.context)}`,
      `published=${publishedField(item?.published)}`,
      `branch=${deployField(item?.branch)}`,
    ].join(" ");
  });
  return ["Deploys encontrados:", ...lines].join("\n");
}

export function latestDeployReady(deploys) {
  const summary = deploySummary(deploys);
  const latest = Array.isArray(deploys) ? deploys[0] : null;
  return { ok: latest?.state === "ready", summary };
}

export const SAMPLE_COUNT = 20;

export const CLINIC_MEDIAN_LIMIT_MS = 1500;

export function medianOverLimit(median, limitMs = CLINIC_MEDIAN_LIMIT_MS) {
  if (!Number.isFinite(median) || !Number.isFinite(limitMs)) {
    throw new Error("Mediana inválida.");
  }
  return median > limitMs;
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
    `Status /admin: ${input.adminStatuses.join(", ")}`,
    `Mediana de /admin: ${input.adminMedian.toFixed(1)} ms`,
    `Pior caso de /admin: ${input.adminWorst.toFixed(1)} ms`,
    `Status /consultorio/pacientes: ${input.clinicStatuses.join(", ")}`,
    `Mediana de /consultorio/pacientes: ${input.clinicMedian.toFixed(1)} ms`,
    `Pior caso de /consultorio/pacientes: ${input.clinicWorst.toFixed(1)} ms`,
    `Limite de /consultorio/pacientes: ${input.limitMs.toFixed(1)} ms`,
    `Usuários de teste removidos: ${input.removed ? "sim" : "não"}`,
  ].join("\n");
}
