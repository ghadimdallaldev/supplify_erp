import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import {
  useAcknowledgeStaffAnnouncementMutation,
  useCreateStaffAnnouncementMutation,
  useGetStaffAnnouncementsQuery,
} from '../../../services/staffApi'
import { StaffPanel } from '../staffShared'

export function StaffAnnouncementsTab() {
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    requireAck: false,
    roles: '',
  })

  const { data: announcements = [], isLoading: announcementsLoading } =
    useGetStaffAnnouncementsQuery()
  const [createAnnouncement, { isLoading: creatingAnnouncement }] =
    useCreateStaffAnnouncementMutation()
  const [ackAnnouncement] = useAcknowledgeStaffAnnouncementMutation()

  const handleCreateAnnouncement = async () => {
    if (!announcementForm.title || !announcementForm.body) {
      toast.error('Announcement needs a title and message')
      return
    }
    try {
      await createAnnouncement({
        title: announcementForm.title,
        body: announcementForm.body,
        requireAck: announcementForm.requireAck,
        audience: announcementForm.roles
          ? {
              roles: announcementForm.roles
                .split(',')
                .map((role) => role.trim())
                .filter(Boolean),
            }
          : undefined,
      }).unwrap()
      toast.success('Announcement published')
      setAnnouncementForm({ title: '', body: '', requireAck: false, roles: '' })
    } catch {
      toast.error('Unable to publish announcement')
    }
  }

  const handleAckAnnouncement = async (announcementId: string, staffId: string) => {
    try {
      await ackAnnouncement({ id: announcementId, staffId }).unwrap()
      toast.success('Acknowledged')
    } catch {
      toast.error('Unable to acknowledge announcement')
    }
  }

  return (
    <div className="space-y-4">
      <StaffPanel
        title="Announcements"
        description="Keep every shift aligned with clear broadcasts and read receipts."
        footer={
          <Button onClick={handleCreateAnnouncement} disabled={creatingAnnouncement}>
            {creatingAnnouncement ? 'Publishing…' : 'Publish announcement'}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="announcementTitle">Title</Label>
              <Input
                id="announcementTitle"
                value={announcementForm.title}
                onChange={(event) =>
                  setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="announcementRoles">Audience roles (comma separated)</Label>
              <Input
                id="announcementRoles"
                value={announcementForm.roles}
                onChange={(event) =>
                  setAnnouncementForm((prev) => ({ ...prev, roles: event.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="announcementBody">Message</Label>
            <Textarea
              id="announcementBody"
              rows={4}
              value={announcementForm.body}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, body: event.target.value }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={announcementForm.requireAck}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, requireAck: event.target.checked }))
              }
            />
            Require acknowledgment from staff
          </label>
        </div>
      </StaffPanel>

      <StaffPanel title="Published" description="Recent broadcasts to your team.">
        {announcementsLoading ? (
          <p className="text-sm text-[var(--text-mid)]">Loading announcements…</p>
        ) : announcements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)]/40 p-6 text-center text-sm text-[var(--text-mid)]">
            <p>No announcements yet.</p>
          </div>
        ) : (
          <ul className="-mx-4 -mb-4 divide-y divide-[var(--app-border)] sm:-mx-5 sm:-mb-5">
            {announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="space-y-2 px-4 py-4 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{announcement.title}</p>
                    <p className="text-xs text-[var(--text-mid)]">
                      {format(new Date(announcement.publishedAt), 'MMM d, yyyy · p')}
                    </p>
                  </div>
                  <Badge className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                    {announcement.requireAck
                      ? `${announcement.acknowledgmentCount} acknowledged`
                      : 'Info'}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--text-mid)]">{announcement.body}</p>
                {announcement.audience?.roles ? (
                  <p className="text-xs text-[var(--text-mid)]">
                    Audience: {(announcement.audience.roles as string[]).join(', ')}
                  </p>
                ) : null}
                {announcement.requireAck ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const staffId = window.prompt(
                        'Enter staff ID acknowledging this announcement:'
                      )
                      if (staffId) handleAckAnnouncement(announcement.id, staffId)
                    }}
                  >
                    Record acknowledgment
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </StaffPanel>
    </div>
  )
}
