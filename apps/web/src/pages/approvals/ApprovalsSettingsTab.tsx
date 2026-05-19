import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  useGetApprovalRulesQuery,
  useCreateApprovalRuleMutation,
  useDeleteApprovalRuleMutation,
  useGetApprovalBudgetsQuery,
  useCreateApprovalBudgetMutation,
  useDeleteApprovalBudgetMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2, Plus, Trash2 } from 'lucide-react'

export function ApprovalsSettingsTab() {
  const { data: rulesData, isLoading: rulesLoading } = useGetApprovalRulesQuery()
  const { data: budgetsData, isLoading: budgetsLoading } = useGetApprovalBudgetsQuery()
  const [createRule] = useCreateApprovalRuleMutation()
  const [deleteRule] = useDeleteApprovalRuleMutation()
  const [createBudget] = useCreateApprovalBudgetMutation()
  const [deleteBudget] = useDeleteApprovalBudgetMutation()

  const [ruleForm, setRuleForm] = useState({
    name: '',
    thresholdAmount: '',
    requiresRole: 'RESTAURANT_MANAGER',
  })
  const [budgetForm, setBudgetForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    totalBudget: '',
    category: '',
    allocatedAmount: '',
  })

  const rules =
    rulesData?.rules?.filter((r: { is_active?: boolean }) => r.is_active !== false) || []
  const periods =
    budgetsData?.periods?.filter((p: { is_active?: boolean }) => p.is_active !== false) || []

  const handleCreateRule = async () => {
    try {
      await createRule({
        name: ruleForm.name,
        thresholdAmount: Number(ruleForm.thresholdAmount),
        requiresRole: ruleForm.requiresRole,
      }).unwrap()
      toast.success('Approval rule created')
      setRuleForm({ name: '', thresholdAmount: '', requiresRole: 'RESTAURANT_MANAGER' })
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to create rule')
    }
  }

  const handleCreateBudget = async () => {
    try {
      await createBudget({
        name: budgetForm.name,
        periodType: 'monthly',
        startDate: budgetForm.startDate,
        endDate: budgetForm.endDate,
        totalBudget: Number(budgetForm.totalBudget),
        allocations: budgetForm.category
          ? [
              {
                category: budgetForm.category,
                allocatedAmount: Number(budgetForm.allocatedAmount) || 0,
              },
            ]
          : [],
      }).unwrap()
      toast.success('Budget period created')
      setBudgetForm({
        name: '',
        startDate: '',
        endDate: '',
        totalBudget: '',
        category: '',
        allocatedAmount: '',
      })
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to create budget')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Approval rules</CardTitle>
          <CardDescription>
            Orders above the threshold require approval before suppliers are notified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rulesLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          ) : (
            <ul className="space-y-2 text-sm">
              {rules.map(
                (rule: {
                  id: string
                  name: string
                  threshold_amount?: number
                  requires_role?: string
                }) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between rounded-md border border-[var(--app-border)] px-3 py-2"
                  >
                    <span>
                      <strong>{rule.name}</strong> — over $
                      {Number(rule.threshold_amount || 0).toFixed(2)} →{' '}
                      {rule.requires_role || 'assigned approver'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteRule(rule.id)
                          .unwrap()
                          .then(() => toast.success('Rule deactivated'))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                )
              )}
              {!rules.length && <p className="text-[var(--text-muted)]">No active rules yet.</p>}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2 border-t pt-4">
            <div>
              <Label>Rule name</Label>
              <Input
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Threshold ($)</Label>
              <Input
                type="number"
                value={ruleForm.thresholdAmount}
                onChange={(e) => setRuleForm({ ...ruleForm, thresholdAmount: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Approver role</Label>
              <Input
                value={ruleForm.requiresRole}
                onChange={(e) => setRuleForm({ ...ruleForm, requiresRole: e.target.value })}
              />
            </div>
            <Button
              onClick={handleCreateRule}
              disabled={!ruleForm.name || !ruleForm.thresholdAmount}
            >
              <Plus className="h-4 w-4 mr-1" /> Add rule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget periods</CardTitle>
          <CardDescription>Track spend by category against allocated budgets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {budgetsLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ul className="space-y-2 text-sm">
              {periods.map(
                (p: {
                  id: string
                  name: string
                  start_date: string
                  end_date: string
                  total_budget: number
                }) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-md border border-[var(--app-border)] px-3 py-2"
                  >
                    <span>
                      {p.name} ({p.start_date} → {p.end_date}) — $
                      {Number(p.total_budget).toFixed(2)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteBudget(p.id)
                          .unwrap()
                          .then(() => toast.success('Budget removed'))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                )
              )}
              {!periods.length && (
                <p className="text-[var(--text-muted)]">No budget periods yet.</p>
              )}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2 border-t pt-4">
            <div>
              <Label>Name</Label>
              <Input
                value={budgetForm.name}
                onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Total budget ($)</Label>
              <Input
                type="number"
                value={budgetForm.totalBudget}
                onChange={(e) => setBudgetForm({ ...budgetForm, totalBudget: e.target.value })}
              />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={budgetForm.startDate}
                onChange={(e) => setBudgetForm({ ...budgetForm, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={budgetForm.endDate}
                onChange={(e) => setBudgetForm({ ...budgetForm, endDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={budgetForm.category}
                onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}
              />
            </div>
            <div>
              <Label>Category allocation ($)</Label>
              <Input
                type="number"
                value={budgetForm.allocatedAmount}
                onChange={(e) => setBudgetForm({ ...budgetForm, allocatedAmount: e.target.value })}
              />
            </div>
            <Button
              onClick={handleCreateBudget}
              disabled={!budgetForm.name || !budgetForm.startDate || !budgetForm.endDate}
            >
              <Plus className="h-4 w-4 mr-1" /> Add budget period
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
