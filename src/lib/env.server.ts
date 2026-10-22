import "server-only";

import { parseServerEnv } from "@/lib/env";

export const serverEnv = parseServerEnv(process.env);
