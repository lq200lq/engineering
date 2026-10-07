import { ConfigError } from "../config/load.js";
import type { JsonScalar, ProjectProfile, Registry, RegistryRule } from "../config/types.js";

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readDottedValue(profile: ProjectProfile, dottedPath: string): unknown {
  let value: unknown = profile;
  for (const part of dottedPath.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function matchesCondition(profile: ProjectProfile, path: string, expected: JsonScalar, ruleId: string): boolean {
  const actual = readDottedValue(profile, path);
  if (actual === undefined) return false;
  if (actual === null || expected === null) {
    if (actual !== expected) {
      throw new ConfigError(`Profile 条件 "${path}" 类型不匹配（规则 ${ruleId}）`);
    }
    return true;
  }
  if (typeof actual !== typeof expected) {
    throw new ConfigError(`Profile 条件 "${path}" 类型不匹配（规则 ${ruleId}）`);
  }
  if (typeof actual === "object") {
    throw new ConfigError(`Profile 条件 "${path}" 必须解析为 scalar（规则 ${ruleId}）`);
  }
  return actual === expected;
}

function assertSupersedesAcyclic(registry: Registry): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visiting.has(id)) throw new ConfigError(`Registry supersedes 关系存在循环: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of registry.rules[id]?.supersedes ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of Object.keys(registry.rules)) visit(id);
}

export interface MatchedRule {
  id: string;
  rule: RegistryRule;
}

export function matchRules(profile: ProjectProfile, registry: Registry): MatchedRule[] {
  assertSupersedesAcyclic(registry);
  const matched = Object.entries(registry.rules)
    .filter(([, rule]) => {
      if (rule.always === true) return true;
      return Object.entries(rule.when ?? {}).every(([path, expected]) => matchesCondition(profile, path, expected, rule.id));
    })
    .map(([id, rule]) => ({ id, rule }));

  const matchedIds = new Set(matched.map(({ id }) => id));
  const supersededIds = new Set<string>();
  function suppressSuperseded(id: string): void {
    for (const target of registry.rules[id]?.supersedes ?? []) {
      if (!matchedIds.has(target) || supersededIds.has(target)) continue;
      supersededIds.add(target);
      suppressSuperseded(target);
    }
  }
  for (const { id } of matched) suppressSuperseded(id);
  const active = matched.filter(({ id }) => !supersededIds.has(id));
  const activeIds = new Set(active.map(({ id }) => id));

  for (const { id, rule } of active) {
    for (const conflictingId of rule.conflicts ?? []) {
      if (activeIds.has(conflictingId)) {
        throw new ConfigError(`规则 "${id}" 与规则 "${conflictingId}" 冲突`);
      }
    }
  }

  return active.sort((a, b) => a.rule.priority - b.rule.priority || compareText(a.id, b.id));
}
