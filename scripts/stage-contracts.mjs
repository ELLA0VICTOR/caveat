import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { ACCOUNT_WASM_BYTES, ACCOUNT_WASM_HASH } from '../src/lib/contracts.ts'

const source = new URL('../contracts/target/wasm32v1-none/release/caveat_account.wasm', import.meta.url)
let wasm
try { wasm = await readFile(source) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  console.warn('Caveat WASM is missing. Build the contracts to enable wallet deployment; the frontend can still run.')
  process.exit(0)
}
if (wasm.length !== ACCOUNT_WASM_BYTES || createHash('sha256').update(wasm).digest('hex') !== ACCOUNT_WASM_HASH) {
  throw new Error('Caveat WASM does not match the tested release pin. Review and update src/lib/contracts.ts after contract verification.')
}
const destination = new URL('../public/contracts/', import.meta.url)
await mkdir(destination, { recursive: true })
await writeFile(new URL('caveat_account.wasm', destination), wasm)
console.log(`Staged verified Caveat WASM (${wasm.length} bytes).`)
