// A small argument parser shared by the tools. No dependencies.
//   --name value, --name=value, --flag (when listed in `flags`), positionals.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function parseArgs(argv, flags = []) {
  const bool = new Set(flags);
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      out.opts[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const name = arg.slice(2);
    if (bool.has(name)) out.opts[name] = true;
    else out.opts[name] = argv[++i];
  }
  return out;
}

/** True when this module is the program being run, not imported by a test. */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(resolve(process.argv[1])).href;
}
