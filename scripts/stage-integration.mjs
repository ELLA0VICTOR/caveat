import { cp } from 'node:fs/promises'
// A compiled independent app, served alongside the landing page for convenience.
await cp(new URL('../examples/pool-deposit/dist/', import.meta.url), new URL('../public/integrations/pool/', import.meta.url), { recursive: true })
