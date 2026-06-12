import { buildAdminOverviewMetrics } from '../src/lib/admin-overview-metrics.js'

const data = await buildAdminOverviewMetrics()
console.log(JSON.stringify(data, null, 2))
process.exit(0)
