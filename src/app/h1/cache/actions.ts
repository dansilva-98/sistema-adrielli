"use server";

import { updateTag } from "next/cache";

export async function bumpStampAction(): Promise<void> {
  updateTag("h1-stamp");
}
