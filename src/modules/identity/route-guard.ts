export function isGuardedRouteFile(filePath: string): boolean {
  const name = filePath.split(/[\\/]/).pop() ?? "";
  return /^(?:page|layout|route|actions)\.tsx?$/.test(name);
}

export function sourceDeclaresStaffGuard(source: string): boolean {
  return source.includes("requireStaff(") || source.includes("assertRole(");
}

export function sourceDeclaresOriginGuard(source: string): boolean {
  const mutates = /\bexport\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/.test(
    source,
  );
  if (!mutates) return true;
  return source.includes("sameOrigin(");
}
