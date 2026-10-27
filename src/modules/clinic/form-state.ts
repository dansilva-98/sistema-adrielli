import type { GuardianRelationship } from "./format";

export type ClinicActionState = {
  ok: boolean;
  code: "" | "duplicate";
  message: string;
};

export const idleClinicAction: ClinicActionState = {
  ok: false,
  code: "",
  message: "",
};

export type PatientSearchState = {
  patients: {
    id: string;
    fullName: string;
    preferredName: string | null;
    birthDate: string;
    guardianName: string | null;
    guardianPhone: string | null;
  }[];
  hasQuery: boolean;
  message: string;
};

export type GuardianSearchState = {
  matches: {
    id: string;
    fullName: string;
    relationship: GuardianRelationship;
    phone: string;
  }[];
  message: string;
};
