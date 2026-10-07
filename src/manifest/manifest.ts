import type { Manifest, ManifestInput } from "../config/types.js";
import { parseManifest } from "../config/load.js";
import { hashTree, sha256 } from "./hash.js";

export const RESOLVER_VERSION = "0.1.0";

export async function createManifest(input: ManifestInput): Promise<Manifest> {
  const manifest: Manifest = {
    formatVersion: 1,
    standards: {
      source: input.registry.standards.id,
      version: input.registry.standards.version,
      revision: input.revision,
      resolverVersion: RESOLVER_VERSION,
      resolvedAt: new Date().toISOString(),
    },
    inputs: {
      profileSha256: sha256(input.profileContent),
      registrySha256: sha256(input.registryContent),
    },
    generatedSha256: hashTree(input.resolvedFiles.map(({ destinationPath, content }) => ({ path: destinationPath, content }))),
    rules: input.resolvedFiles.map(({ ruleId, sourcePath, sourceSha256 }) => ({
      id: ruleId,
      path: sourcePath,
      sha256: sourceSha256,
    })),
  };
  return parseManifest(manifest);
}
