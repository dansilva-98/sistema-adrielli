export function serverEditSync(input: {
  serverVersion: number;
  knownVersion: number;
  savedVersion: number | undefined;
  dirty: boolean;
}): { apply: "ignore" | "remember-save" | "reload" | "keep-draft"; version: number } {
  const { serverVersion, knownVersion, savedVersion, dirty } = input;
  if (savedVersion != null && savedVersion >= serverVersion) {
    return { apply: "remember-save", version: savedVersion };
  }
  if (serverVersion <= knownVersion) {
    return { apply: "ignore", version: knownVersion };
  }
  if (dirty) {
    return { apply: "keep-draft", version: knownVersion };
  }
  return { apply: "reload", version: serverVersion };
}

export function confirmContentVersion(
  confirmed: number,
  savedVersion: number | undefined,
): number {
  return savedVersion != null && savedVersion > confirmed ? savedVersion : confirmed;
}
