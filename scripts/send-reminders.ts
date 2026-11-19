import { publicLogMessage, runReminderJob } from "../src/modules/clinic/reminder-job.ts";

async function main(): Promise<void> {
  try {
    const result = await runReminderJob({
      env: process.env,
      onError: (message) => {
        console.error(message);
      },
    });
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(publicLogMessage(error));
    process.exitCode = 1;
  }
}

void main();
