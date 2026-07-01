import { useState } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
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

import { useStaffWriteAccess } from '../staffShared'

export function StaffAnnouncementsTab() {
  const { t } = useTranslation('staff')
  const canWriteStaff = useStaffWriteAccess()
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
      toast.error(t('announcements.validationRequired'))
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
      toast.success(t('announcements.published'))
      setAnnouncementForm({ title: '', body: '', requireAck: false, roles: '' })
    } catch {
      toast.error(t('announcements.publishFailed'))
    }
  }

  const handleAckAnnouncement = async (announcementId: string, staffId: string) => {
    try {
      await ackAnnouncement({ id: announcementId, staffId }).unwrap()
      toast.success(t('announcements.acknowledged'))
    } catch {
      toast.error(t('announcements.ackFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <StaffPanel
        title={t('announcements.title')}
        description={t('announcements.description')}
        footer={
          canWriteStaff ? (
            <Button onClick={handleCreateAnnouncement} disabled={creatingAnnouncement}>
              {creatingAnnouncement ? t('announcements.publishing') : t('announcements.publish')}
            </Button>
          ) : null
        }
      >
        <fieldset disabled={!canWriteStaff} className="space-y-4">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="announcementTitle">{t('announcements.titleLabel')}</Label>
                <Input
                  id="announcementTitle"
                  value={announcementForm.title}
                  onChange={(event) =>
                    setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="announcementRoles">{t('announcements.audienceRoles')}</Label>
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
              <Label htmlFor="announcementBody">{t('announcements.message')}</Label>
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
              {t('announcements.requireAck')}
            </label>
          </div>
        </fieldset>
      </StaffPanel>

      <StaffPanel
        title={t('announcements.publishedTitle')}
        description={t('announcements.publishedDescription')}
      >
        {announcementsLoading ? (
          <p className="text-sm text-[var(--text-mid)]">{t('announcements.loading')}</p>
        ) : announcements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)]/40 p-6 text-center text-sm text-[var(--text-mid)]">
            <p>{t('announcements.empty')}</p>
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
                      ? t('announcements.ackCount', {
                          count: announcement.acknowledgmentCount,
                        })
                      : t('shared.info')}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--text-mid)]">{announcement.body}</p>
                {announcement.audience?.roles ? (
                  <p className="text-xs text-[var(--text-mid)]">
                    {t('shared.audiencePrefix', {
                      roles: (announcement.audience.roles as string[]).join(', '),
                    })}
                  </p>
                ) : null}
                {announcement.requireAck ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const staffId = window.prompt(t('announcements.staffIdPrompt'))
                      if (staffId) handleAckAnnouncement(announcement.id, staffId)
                    }}
                  >
                    {t('announcements.recordAck')}
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
