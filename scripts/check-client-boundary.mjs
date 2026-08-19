/**
 * React Server Components boundary check.
 *
 * Every export of a `"use client"` module is replaced, on the server, by a
 * client-reference proxy — not the real value. A Server Component may import
 * a *component* across that boundary (React resolves the reference when it
 * renders), but reading a plain data export gives back a nested reference
 * whose id (`file#EXPORT#key`) has no entry in the client manifest. The RSC
 * serializer then throws at request time:
 *
 *   Could not find the module ".../common.tsx#PHASE_NAMES#3" in the React
 *   Client Manifest.
 *
 * TypeScript cannot see this — the types are correct, the build succeeds, and
 * the page 500s in production. Hence a source-level check.
 *
 * Rule: a server module may only import PascalCase bindings (components) from
 * a `"use client"` module. Constants, helpers, and data must live in a
 * boundary-neutral module that both sides import.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const SRC = resolve(import.meta.dirname, "../src");

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

/** Resolve a relative/aliased specifier to an on-disk .ts/.tsx path, or null. */
const resolveSpecifier = (spec, fromFile) => {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(fromFile), spec)
      : null;
  if (!base) return null; // bare package import — not ours
  for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    try { if (statSync(cand).isFile()) return cand; } catch { /* next candidate */ }
  }
  return null;
};

const isPascalCase = (name) => /^[A-Z][a-zA-Z0-9]*$/.test(name);

/**
 * @returns {{file: string, target: string, binding: string}[]} one entry per
 * non-component binding a server module pulls across a client boundary.
 */
export function findBoundaryViolations() {
  const files = walk(SRC);
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const isClient = (f) => /^\s*["']use client["']/.test(sources.get(f) ?? "");

  const violations = [];
  for (const file of files) {
    if (isClient(file)) continue; // client → client is fine
    const src = sources.get(file);

    // `import { a, b as c } from "spec"` — named specifiers only; a default
    // import is always a component reference and is always legal.
    for (const m of src.matchAll(/import\s+(type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      const [, typeOnly, inner, spec] = m;
      if (typeOnly) continue; // erased at compile time — never reaches runtime
      const target = resolveSpecifier(spec, file);
      if (!target || !isClient(target)) continue;

      for (const raw of inner.split(",")) {
        const part = raw.trim();
        if (!part || part.startsWith("type ")) continue; // inline type specifier
        const binding = part.split(/\s+as\s+/)[0].trim();
        if (!isPascalCase(binding)) {
          violations.push({
            file: relative(SRC, file),
            target: relative(SRC, target),
            binding,
          });
        }
      }
    }
  }
  return violations;
}
