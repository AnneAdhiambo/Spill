import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// apps/worker/src -> radio/
const RADIO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

/** Relative paths in env are resolved against the radio/ project root, never the process cwd. */
export function resolveFromRoot(value: string): string {
  return isAbsolute(value) ? value : resolve(RADIO_ROOT, value)
}

export function mediaRoot(env: NodeJS.ProcessEnv): string {
  return resolveFromRoot(env.MEDIA_ROOT || "./media")
}
