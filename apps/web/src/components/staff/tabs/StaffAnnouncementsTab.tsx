import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Announcements</CardTitle>
          <CardDescription>
            Keep every shift aligned with clear broadcasts and read receipts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <input
                  id="announcementAck"
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-[var(--app-border-mid)]"
                  checked={announcementForm.requireAck}
                  onChange={(event) =>
                    setAnnouncementForm((prev) => ({
                      ...prev,
                      requireAck: event.target.checked,
                    }))
                  }
                />
                <Label htmlFor="announcementAck" className="text-xs">
                  Require acknowledgment
                </Label>
              </div>
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
          <div className="flex justify-end">
            <Button onClick={handleCreateAnnouncement} disabled={creatingAnnouncement}>
              {creatingAnnouncement ? 'Publishing…' : 'Publish announcement'}
            </Button>
          </div>
          <div className="space-y-3">
            {announcementsLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading announcements…</p>
            ) : announcements.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
                <p>No announcements yet.</p>
              </div>
            ) : (
              announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {announcement.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {format(new Date(announcement.publishedAt), 'MMM d, yyyy · p')}
                      </p>
                    </div>
                    <Badge className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                      {announcement.requireAck
                        ? `${announcement.acknowledgmentCount} acknowledged`
                        : 'Info'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">{announcement.body}</p>
                  {announcement.audience?.roles ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Audience: {(announcement.audience.roles as string[]).join(', ')}
                    </p>
                  ) : null}
                  {announcement.requireAck ? (
                    <div className="mt-3">
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
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
