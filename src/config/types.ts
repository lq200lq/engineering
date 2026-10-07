export type JsonScalar = string | number | boolean | null;

export interface ProjectProfile {
  project: {
    name: string;
    type: string;
    scale?: string;
  };
  capabilities?: {
    backend?: boolean;
    frontend?: boolean;
    database?: boolean;
    ai?: boolean;
    cache?: boolean;
    mq?: boolean;
    fileStorage?: boolean;
  };
  stack?: {
    backend?: { language?: string; framework?: string };
    frontend?: { framework?: string };
    database?: { type?: string };
  };
  deployment?: { type?: string; internetAccess?: boolean };
  preferences?: { architecture?: string; simplicity?: string };
}

export type CheckLevel = "mandatory" | "recommended" | "guideline";

export interface FileExistsCheck {
  type: "file_exists";
  level: CheckLevel;
  pattern: string;
}

export interface DependencyCheck {
  type: "dependency_present" | "dependency_absent";
  level: CheckLevel;
  name: string;
}

export interface MigrationExistsCheck {
  type: "migration_exists";
  level: CheckLevel;
  pattern: string;
}

export type CheckSpec = FileExistsCheck | DependencyCheck | MigrationExistsCheck;

export interface RegistryRule {
  id: string;
  priority: number;
  always?: true;
  when?: Record<string, JsonScalar>;
  path: string | string[];
  conflicts?: string[];
  supersedes?: string[];
  checks?: CheckSpec[];
}

export interface Registry {
  standards: { id: string; version: string };
  rules: Record<string, RegistryRule>;
}

export interface ManifestRule {
  id: string;
  path: string;
  sha256: string;
}

export interface Manifest {
  formatVersion: 1;
  standards: {
    source: string;
    version: string;
    revision: string;
    resolverVersion: string;
    resolvedAt: string;
  };
  inputs: { profileSha256: string; registrySha256: string };
  generatedSha256: string;
  rules: ManifestRule[];
}

export interface ResolvedRuleFile {
  ruleId: string;
  sourcePath: string;
  sourceSha256: string;
  destinationPath: string;
  content: string;
}

export interface ManifestInput {
  registry: Registry;
  revision: string;
  profileContent: string;
  registryContent: string;
  resolvedFiles: ResolvedRuleFile[];
}
