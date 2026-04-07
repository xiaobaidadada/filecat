import { fileCompress } from "../file/file.compress"
import { get_zip_file_format_util } from "../../../common/StringUtil"
import { FileUtil } from "../file/FileUtil"

const fs = require("fs")
const path = require("path")
const os = require("os")

const VERSION = "15.0.1"

let BASE_DIR :string;
if(__filename.endsWith(".ts")) {
  BASE_DIR = path.join(__dirname, "..",'..','..','..', "build")
} else {
  BASE_DIR = path.join(__dirname)
}
const BIN_DIR = path.join(BASE_DIR, "ripgrep")

export const RG_PATH:"rg.exe"|"rg" = path.join(
    BIN_DIR,
    process.platform === "win32" ? "rg.exe" : "rg"
)

// --------------------
// platform
// --------------------
function getPlatform() {
  const arch = process.arch
  const platform = process.platform

  if (platform === "darwin") {
    return arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
  }

  if (platform === "linux") {
    return arch === "arm64"
        ? "aarch64-unknown-linux-musl"
        : "x86_64-unknown-linux-musl"
  }

  if (platform === "win32") {
    return arch === "arm64"
        ? "aarch64-pc-windows-msvc"
        : "x86_64-pc-windows-msvc"
  }

  throw new Error("Unsupported platform")
}

// --------------------
// recursive find binary
// --------------------
function findBinary(dir) {
  const stack = [dir]

  while (stack.length) {
    const cur = stack.pop()
    if (!fs.existsSync(cur)) continue

    const entries = fs.readdirSync(cur, { withFileTypes: true })

    for (const e of entries) {
      const full = path.join(cur, e.name)

      if (e.isDirectory()) {
        stack.push(full)
      } else {
        if (e.name === "rg" || e.name === "rg.exe") {
          return full
        }
      }
    }
  }

  return null
}

// --------------------
// main
// --------------------
export async function download_ripgrep() {
  if (fs.existsSync(RG_PATH)) {
    console.log("[ripgrep] exists, skip")
    return
  }

  const target = getPlatform()
  const ext = process.platform === "win32" ? "zip" : "tar.gz"

  const fileName = `ripgrep-v${VERSION}-${target}.${ext}`

  const url =
      `https://github.com/microsoft/ripgrep-prebuilt/releases/download/v${VERSION}/${fileName}`

  console.log("[ripgrep] download:", url)

  fs.mkdirSync(BIN_DIR, { recursive: true })

  const tmpFile = path.join(os.tmpdir(), fileName)
  const tmpDir = path.join(os.tmpdir(), "rg_extract_" + Date.now())

  // --------------------
  // download
  // --------------------
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error("download failed: " + res.status)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(tmpFile, buffer)

  // --------------------
  // extract (your business dependency)
  // --------------------
  const format = get_zip_file_format_util(tmpFile)

  console.log("[ripgrep] extracting...")

  const outDir = await FileUtil.get_next_numbered_name(tmpDir)

  await fileCompress.handle_un(
      format,
      tmpFile,
      outDir,
      () => {}
  )

  // --------------------
  // find binary (IMPORTANT FIX)
  // --------------------
  const src = findBinary(tmpDir)

  if (!src) {
    throw new Error("rg binary not found after extract")
  }

  // --------------------
  // copy to final location
  // --------------------
  fs.mkdirSync(BIN_DIR, { recursive: true })

  fs.copyFileSync(src, RG_PATH)

  if (process.platform !== "win32") {
    fs.chmodSync(RG_PATH, 0o755)
  }

  console.log("[ripgrep] installed:", RG_PATH)

  // --------------------
  // cleanup
  // --------------------
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.rmSync(tmpFile, { force: true })
}