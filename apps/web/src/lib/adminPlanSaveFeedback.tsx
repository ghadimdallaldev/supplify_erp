import { toast } from 'sonner'
import { formatAdminPlanValidationError } from './adminPlanSaveFeedback.ts'

export function notifyAdminPlanSaveSuccess(
  planLabel: string,
  validationWarnings?: string[] | null
) {
  const warnings = (validationWarnings ?? []).filter(Boolean)

  if (warnings.length === 0) {
    toast.success(`Plan “${planLabel}” saved`)
    return
  }

  toast.custom(
    (id) => (
      <div
        className="max-w-md rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg transition-[transform,opacity] duration-200 ease-out"
        role="status"
      >
        <p className="font-semibold text-amber-950">Saved with warnings</p>
        <p className="mt-1 text-sm text-amber-900">
          Plan “{planLabel}” was saved, but the tier ladder may be inconsistent:
        </p>
        <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-amber-950">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-3 text-xs font-medium text-amber-800 underline erp-pressable"
          onClick={() => toast.dismiss(id)}
        >
          Dismiss
        </button>
      </div>
    ),
    { duration: 12_000, position: 'top-center' }
  )
}

export function notifyAdminPlanSaveError(err: unknown) {
  const message = formatAdminPlanValidationError(err)

  toast.custom(
    (id) => (
      <div
        className="max-w-md rounded-lg border border-red-300 bg-red-50 px-4 py-3 shadow-lg transition-[transform,opacity] duration-200 ease-out"
        role="alert"
      >
        <p className="font-semibold text-red-950">Plan save failed</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-red-900">{message}</p>
        <button
          type="button"
          className="mt-3 text-xs font-medium text-red-800 underline erp-pressable"
          onClick={() => toast.dismiss(id)}
        >
          Dismiss
        </button>
      </div>
    ),
    { duration: 10_000, position: 'top-center' }
  )
}
