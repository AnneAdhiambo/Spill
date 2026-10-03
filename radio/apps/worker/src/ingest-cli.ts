import { Ingester } from "./ingest.js"
import { mediaRoot } from "./paths.js"
import { join } from "node:path"

const dir = join(mediaRoot(process.env), "radio")
const log = (message: string, data?: Record<string, unknown>) => console.log(JSON.stringify({ service: "spill-ingest", message, ...data }))
log("ingest folder", { dir })
void new Ingester(dir, log).scan().then((recs) => log("ingest done", { ready: recs.length }))
