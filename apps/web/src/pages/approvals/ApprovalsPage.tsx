import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import {
  useGetPendingApprovalsQuery,
  useGetApprovalBudgetsQuery,
  useGetApprovalBudgetUsageQuery,
  useApproveOrderRequestMutation,
  useRejectOrderRequestMutation,
} from '../../services/api'
import { formatCurrency, formatPrice } from '../../utils/format'
import toast from 'react-hot-toast'
import { Loader2, Check, X, AlertTriangle } from 'lucide-react'
import { Textarea } from '../../components/ui/textarea'

export function ApprovalsPage() {
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')

  const { data: pendingData, isLoading: pendingLoading, refetch } = useGetPendingApprovalsQuery()
  const { data: budgetsData } = useGetApprovalBudgetsQuery()
  const periods = budgetsData?.periods || []
  const activePeriodId = selectedPeriodId || periods[0]?.id || ''
  const { data: usageData, isLoading: usageLoading } = useGetApprovalBudgetUsageQuery(
    activePeriodId,
    {
      skip: !activePeriodId,
    }
  )
  const [approve] = useApproveOrderRequestMutation()
  const [reject] = useRejectOrderRequestMutation()

  const handleApprove = async (id: string) => {
    try {
      await approve({ id }).unwrap()
      toast.success('Order approved')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to approve')
    }
  }

  const handleReject = async () => {
    if (!rejectId || !rejectNotes.trim()) {
      toast.error('Rejection notes are required')
      return
    }
    try {
      await reject({ id: rejectId, notes: rejectNotes }).unwrap()
      toast.success('Order rejected')
      setRejectId(null)
      setRejectNotes('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to reject')
    }
  }

  const categories =
    (usageData?.categories as Array<{
      category: string
      allocated: number
      spent: number
      remaining: number
      percentUsed: number
      lowRemaining: boolean
    }>) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[21px] font-black text-[var(--text)]">Approvals & Budgets</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Review pending orders and monitor budget usage
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
          <TabsTrigger value="budget">Budget Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Orders awaiting your approval</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : !pendingData?.approvals?.length ? (
                <p className="text-sm text-[var(--text-muted)]">No pending approvals.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[var(--text-muted)]">
                        <th className="py-2">Order</th>
                        <th>Supplier</th>
                        <th>Requester</th>
                        <th>Amount</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingData.approvals.map(
                        (row: {
                          id: string
                          order_id: string
                          supplier_name?: string
                          requester_name?: string
                          total_amount?: number
                          currency?: string
                        }) => (
                          <tr key={row.id} className="border-b border-[var(--app-border)]">
                            <td className="py-3">
                              <Link
                                to={`/app/orders/${row.order_id}`}
                                className="text-[var(--brand)] font-medium hover:underline"
                              >
                                View order
                              </Link>
                            </td>
                            <td>{row.supplier_name || '—'}</td>
                            <td>{row.requester_name || '—'}</td>
                            <td>{formatCurrency(row.total_amount)}</td>
                            <td className="py-3 text-right space-x-2">
                              <Button size="sm" onClick={() => handleApprove(row.id)}>
                                <Check className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRejectId(row.id)}
                              >
                                <X className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="mt-4 space-y-4">
          {periods.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-[var(--text-muted)]">Period:</span>
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={activePeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
              >
                {periods.map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {usageLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : !activePeriodId ? (
            <p className="text-sm text-[var(--text-muted)]">
              No budget periods configured. Add one in Settings → Approvals.
            </p>
          ) : (
            <>
              {usageData?.summary?.lowRemaining && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Overall budget is below 20% remaining for this period.
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {categories.map((cat) => (
                  <Card key={cat.category}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        {cat.category}
                        {cat.lowRemaining && (
                          <Badge variant="destructive" className="text-xs">
                            Low
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-2 rounded-full bg-[var(--brand-ultra)] overflow-hidden mb-2">
                        <div
                          className="h-full bg-[var(--brand)]"
                          style={{ width: `${Math.min(cat.percentUsed, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Spent {formatPrice(cat.spent)} of {formatPrice(cat.allocated)} (
                        {cat.percentUsed}%)
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {rejectId && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base">Reject order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Reason for rejection (required)"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleReject}>
                Confirm reject
              </Button>
              <Button variant="outline" onClick={() => setRejectId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
