import { Raiko } from '../../../src'
import { appRouter } from '../../../src/app-router'
await new Raiko().use(await appRouter({ dir: new URL('./app', import.meta.url).pathname, dev: false, a11y: false })).listen(4301, { hostname: '127.0.0.1' })
