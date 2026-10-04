import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { join } from "node:path"
import test from "node:test"
import { buildServer } from "../src/server.js"
import { loadConfig } from "../src/config.js"

const npub = "npub1zupsftlnpddt70jepjzlw5pgxxtp0u7jhhrtf7awqmqqxghtem0qyn9j4a"

test("ready radio recordings are listed and can be replayed with byte ranges", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "spill-recordings-"))
  const radio = join(root, "radio")
  await mkdir(radio)
  const audio = Buffer.from("0123456789")
  const sha = createHash("sha256").update(audio).digest("hex")
  await writeFile(join(radio, "Tea.mpeg"), audio)
  await writeFile(join(radio, "Tea.mpeg.transcript.json"), JSON.stringify({
    audioSha256: sha,
    durationSec: 12,
    transcript: { text: "A voice from the community", words: [{ start: 0, end: 1, word: "A" }] },
  }))
  await writeFile(join(radio, "Unready.mp3"), audio)
  await writeFile(join(radio, "manifest.json"), JSON.stringify([
    { file: "Tea.mpeg", title: "Tea", npub },
    { file: "Unready.mp3", title: "Unready", npub },
    { file: "../outside.mp3", title: "Outside", npub },
  ]))
  const app = buildServer(loadConfig({ MEDIA_ROOT: root }))
  try {
    const list = await app.inject({ method: "GET", url: "/api/v1/radio/recordings" })
    assert.equal(list.statusCode, 200)
    assert.deepEqual(list.json().data, [{ id: `rec-${sha.slice(0, 12)}`, title: "Tea", space: null, durationSec: 12 }])

    const replay = await app.inject({
      method: "GET",
      url: `/api/v1/radio/recordings/rec-${sha.slice(0, 12)}/audio`,
      headers: { range: "bytes=2-5" },
    })
    assert.equal(replay.statusCode, 206)
    assert.equal(replay.headers["content-range"], "bytes 2-5/10")
    assert.equal(replay.body, "2345")
    assert.equal((await app.inject({ method: "GET", url: "/api/v1/radio/recordings/rec-000000000000/audio" })).statusCode, 404)
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
