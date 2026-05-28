/** Order statuses where fulfillment is done (delivery through invoicing). */
export const DELIVERED_ORDER_STATUSES = [
  'COMPLETED',
  'DELIVERED',
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'RECEIVED_WITH_DISPUTE',
  'INVOICED',
]

/** SQL fragment: `{column} IN (...)` — column may be qualified, e.g. `o.status`. */
export function deliveredOrderStatusInSql(column = 'status') {
  const list = DELIVERED_ORDER_STATUSES.map((s) => `'${s}'`).join(', ')
  return `${column} IN (${list})`
}
