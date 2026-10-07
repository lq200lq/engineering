export function profile(overrides = {}) {
  return {
    project: { name: "sample", type: "service" },
    ...overrides,
  };
}

export function rule(id, overrides = {}) {
  return { id, priority: 10, always: true, path: `${id}.md`, ...overrides };
}

export function registry(rules) {
  return { standards: { id: "test-standards", version: "1.0.0" }, rules };
}
