import { Ajv, type ErrorObject } from "ajv";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import manifestSchema from "./schemas/manifest.schema.json" with { type: "json" };
import profileSchema from "./schemas/profile.schema.json" with { type: "json" };
import registrySchema from "./schemas/registry.schema.json" with { type: "json" };
import type { Manifest, ProjectProfile, Registry } from "./types.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const ajv = new Ajv({ allErrors: true, strict: true });
type FormatsPlugin = (typeof import("ajv-formats"))["default"];
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
addFormats(ajv, ["date-time"]);

const validators = {
  profile: ajv.compile(profileSchema),
  registry: ajv.compile(registrySchema),
  manifest: ajv.compile(manifestSchema),
};

export async function readYamlFile(path: string): Promise<unknown> {
  const { parseDocument } = await import("yaml");
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${path}: 无法读取 YAML 文件: ${detail}`);
  }

  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    const messages = document.errors.map((error) => error.message).join("\n");
    throw new ConfigError(`${path}: YAML 解析失败:\n${messages}`);
  }
  if (document.contents === null) {
    throw new ConfigError(`${path}: YAML 文件不能为空`);
  }

  try {
    return document.toJSON();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${path}: 无法读取 YAML 值: ${detail}`);
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "不符合 Schema"}`)
    .join("\n");
}

function validate<T>(
  value: unknown,
  validator: (data: unknown) => boolean,
  label: string,
): T {
  if (!validator(value)) {
    const errors = (validator as typeof validator & { errors?: ErrorObject[] | null }).errors;
    throw new ConfigError(`${label} Schema 校验失败:\n${formatErrors(errors)}`);
  }
  return value as T;
}

export function parseProfile(value: unknown): ProjectProfile {
  return validate<ProjectProfile>(value, validators.profile, "engineering.yaml");
}

export function parseRegistry(value: unknown): Registry {
  const registry = validate<Registry>(value, validators.registry, "registry.yaml");
  for (const [key, rule] of Object.entries(registry.rules)) {
    if (key !== rule.id) {
      throw new ConfigError(`registry.yaml: 规则键 "${key}" 必须与 id "${rule.id}" 相同`);
    }
  }

  const ids = new Set(Object.keys(registry.rules));
  for (const rule of Object.values(registry.rules)) {
    for (const relatedId of [...(rule.conflicts ?? []), ...(rule.supersedes ?? [])]) {
      if (!ids.has(relatedId)) {
        throw new ConfigError(`registry.yaml: 规则 "${rule.id}" 引用了不存在的规则 "${relatedId}"`);
      }
    }
  }
  return registry;
}

export function parseManifest(value: unknown): Manifest {
  return validate<Manifest>(value, validators.manifest, ".ai/manifest.yaml");
}
