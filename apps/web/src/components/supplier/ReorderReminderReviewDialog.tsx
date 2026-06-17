import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'

export type ReminderDraft = {
  id: string
  subject: string
  body: string
  status: string
  autoSent?: boolean
  chatUrl?: string | null
  chatPrefill?: string
}

type Props = {
  draft: ReminderDraft | null
  open: boolean
  onClose: () => void
}

export function ReorderReminderReviewDialog({ draft, open, onClose }: Props) {
  if (!draft) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md" data-testid="reorder-reminder-review-dialog">
        <DialogHeader>
          <DialogTitle>Review reminder</DialogTitle>
          <DialogDescription>
            This draft was saved only — nothing was sent automatically. Copy and send via chat or
            email when ready.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Subject</Label>
            <p className="text-sm font-medium mt-1" data-testid="reminder-draft-subject">
              {draft.subject}
            </p>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea
              readOnly
              className="mt-1 min-h-[160px] font-mono text-sm"
              value={draft.body}
              data-testid="reminder-draft-body"
            />
          </div>
        </div>
        <DialogFooter>
          {draft.chatUrl ? (
            <Button variant="default" asChild>
              <a href={draft.chatUrl}>Open in chat</a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            data-testid="reminder-draft-copy"
            onClick={() => {
              void navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`)
            }}
          >
            Copy to clipboard
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
