import { handleClinicReminders } from "../../src/modules/clinic/reminder-function.ts";

export const config = {
  schedule: "23 10-23,0 * * *",
};

export default async function clinicReminders(): Promise<Response> {
  return handleClinicReminders(process.env, {
    log: (message) => {
      console.log(message);
    },
    logError: (message) => {
      console.error(message);
    },
  });
}
