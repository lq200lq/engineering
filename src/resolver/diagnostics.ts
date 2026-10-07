import type { ProjectProfile, Registry } from "../config/types.js";

const stackPaths = [
  "stack.backend.language",
  "stack.backend.framework",
  "stack.frontend.framework",
  "stack.frontend.uiLibrary",
  "stack.frontend.adminScaffold",
  "stack.frontend.cssFramework",
  "stack.database.type",
  "stack.database.migrationTool",
] as const;

function readProfileValue(profile: ProjectProfile, dottedPath: string): unknown {
  let value: unknown = profile;
  for (const part of dottedPath.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export interface UnsupportedStackValue {
  path: string;
  value: string;
}

export function findUnsupportedStackValues(profile: ProjectProfile, registry: Registry): UnsupportedStackValue[] {
  return stackPaths.flatMap((path) => {
    const value = readProfileValue(profile, path);
    if (typeof value !== "string") return [];
    const supportedValues = Object.values(registry.rules)
      .map((rule) => rule.when?.[path])
      .filter((candidate): candidate is string => typeof candidate === "string");
    return supportedValues.includes(value) ? [] : [{ path, value }];
  });
}
