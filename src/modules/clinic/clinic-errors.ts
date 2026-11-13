import type { ClinicRuleError } from "./patients";

export function clinicErrorMessage(code: ClinicRuleError["code"]): string {
  switch (code) {
    case "overlap":
      return "Este horário já está ocupado.";
    case "package-exhausted":
      return "O pacote não tem mais vagas.";
    case "undo-not-allowed":
      return "Não é possível desfazer esta alteração.";
    case "makeup-taken":
      return "Esta falta já tem uma reposição.";
    case "makeup-not-allowed":
      return "Só dá para repor uma falta avisada.";
    case "invalid-transition":
      return "Esta sessão não aceita essa alteração.";
    case "series-conflict":
      return "Há horários com conflito. Nada foi criado.";
    case "package-patient-mismatch":
      return "Este pacote não é deste paciente.";
    case "not-found":
      return "Registro não encontrado.";
    default:
      return "Não foi possível concluir. Tente novamente.";
  }
}
