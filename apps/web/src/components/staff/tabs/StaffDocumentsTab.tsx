import { useState } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import { Select, SelectTrigger } from '../../ui/select'
import {
  useCreateStaffDocumentMutation,
  useCreateStaffIncidentMutation,
  useCreateStaffPerformanceNoteMutation,
  useGetStaffDocumentsQuery,
  useGetStaffIncidentsQuery,
  useGetStaffMembersQuery,
  useGetStaffPerformanceNotesQuery,
} from '../../../services/staffApi'
import { toDatetimeLocalValue, useStaffWriteAccess } from '../staffShared'

export function StaffDocumentsTab() {
  const { t } = useTranslation('staff')
  const canWriteStaff = useStaffWriteAccess()
  const [documentForm, setDocumentForm] = useState({
    staffId: '',
    docType: '',
    title: '',
    fileUrl: '',
    expiresAt: '',
  })
  const [incidentForm, setIncidentForm] = useState({
    staffId: '',
    category: '',
    severity: 'LOW',
    occurredAt: toDatetimeLocalValue(new Date()),
    notes: '',
  })
  const [performanceNoteForm, setPerformanceNoteForm] = useState({
    staffId: '',
    noteType: 'KUDOS',
    body: '',
  })

  const { data: staffMembers = [] } = useGetStaffMembersQuery()
  const { data: documents = [], isLoading: documentsLoading } = useGetStaffDocumentsQuery()
  const { data: incidents = [], isLoading: incidentsLoading } = useGetStaffIncidentsQuery()
  const { data: performanceNotes = [], isLoading: notesLoading } =
    useGetStaffPerformanceNotesQuery()

  const [createDocument, { isLoading: creatingDocument }] = useCreateStaffDocumentMutation()
  const [createIncident, { isLoading: creatingIncident }] = useCreateStaffIncidentMutation()
  const [createPerformanceNote, { isLoading: creatingPerformance }] =
    useCreateStaffPerformanceNoteMutation()

  const handleCreateDocument = async () => {
    if (!documentForm.staffId || !documentForm.docType || !documentForm.fileUrl) {
      toast.error(t('documents.validationDocument'))
      return
    }
    try {
      await createDocument({
        staffId: documentForm.staffId,
        docType: documentForm.docType,
        title: documentForm.title || undefined,
        fileUrl: documentForm.fileUrl,
        expiresAt: documentForm.expiresAt || undefined,
      }).unwrap()
      toast.success(t('documents.documentStored'))
      setDocumentForm({ staffId: '', docType: '', title: '', fileUrl: '', expiresAt: '' })
    } catch {
      toast.error(t('documents.documentStoreFailed'))
    }
  }

  const handleCreateIncident = async () => {
    if (!incidentForm.category || !incidentForm.occurredAt) {
      toast.error(t('documents.validationIncident'))
      return
    }
    try {
      await createIncident({
        staffId: incidentForm.staffId || undefined,
        category: incidentForm.category,
        severity: incidentForm.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        occurredAt: new Date(incidentForm.occurredAt).toISOString(),
        notes: incidentForm.notes || undefined,
      }).unwrap()
      toast.success(t('documents.incidentLogged'))
      setIncidentForm({
        staffId: '',
        category: '',
        severity: 'LOW',
        occurredAt: toDatetimeLocalValue(new Date()),
        notes: '',
      })
    } catch {
      toast.error(t('documents.incidentLogFailed'))
    }
  }

  const handleCreatePerformanceNote = async () => {
    if (!performanceNoteForm.staffId || !performanceNoteForm.body) {
      toast.error(t('documents.validationPerformance'))
      return
    }
    try {
      await createPerformanceNote({
        staffId: performanceNoteForm.staffId,
        noteType: performanceNoteForm.noteType as 'COACHING' | 'KUDOS' | 'GENERAL',
        body: performanceNoteForm.body,
      }).unwrap()
      toast.success(t('documents.noteSaved'))
      setPerformanceNoteForm({ staffId: '', noteType: 'KUDOS', body: '' })
    } catch {
      toast.error(t('documents.noteSaveFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('documents.docsTitle')}</CardTitle>
          <CardDescription>{t('documents.docsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="docStaff">{t('shared.staff')}</Label>
              <Select
                value={documentForm.staffId}
                onValueChange={(value) => setDocumentForm((prev) => ({ ...prev, staffId: value }))}
              >
                <SelectTrigger id="docStaff" className="mt-1 w-full">
                  <option value="">{t('shared.selectStaff')}</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div>
              <Label htmlFor="docType">{t('documents.type')}</Label>
              <Input
                id="docType"
                value={documentForm.docType}
                onChange={(event) =>
                  setDocumentForm((prev) => ({ ...prev, docType: event.target.value }))
                }
                placeholder={t('documents.typePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="docUrl">{t('documents.fileUrl')}</Label>
              <Input
                id="docUrl"
                value={documentForm.fileUrl}
                onChange={(event) =>
                  setDocumentForm((prev) => ({ ...prev, fileUrl: event.target.value }))
                }
                placeholder={t('documents.fileUrlPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="docExpires">{t('documents.expires')}</Label>
              <Input
                id="docExpires"
                type="date"
                value={documentForm.expiresAt}
                onChange={(event) =>
                  setDocumentForm((prev) => ({ ...prev, expiresAt: event.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="docTitle">{t('documents.titleLabel')}</Label>
              <Input
                id="docTitle"
                value={documentForm.title}
                onChange={(event) =>
                  setDocumentForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            {canWriteStaff ? (
              <Button onClick={handleCreateDocument} disabled={creatingDocument}>
                {creatingDocument ? t('documents.uploading') : t('documents.storeDocument')}
              </Button>
            ) : null}
          </div>
          {documentsLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t('documents.loadingDocuments')}</p>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>{t('documents.noDocuments')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {doc.title || doc.docType} · {doc.staff?.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {doc.expiresAt
                          ? t('documents.expiresDate', {
                              date: format(new Date(doc.expiresAt), 'MMM d, yyyy'),
                            })
                          : t('documents.noExpiry')}
                      </p>
                    </div>
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[var(--brand-mid)] hover:underline"
                    >
                      {t('documents.viewFile')}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('documents.incidentsTitle')}</CardTitle>
          <CardDescription>{t('documents.incidentsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--app-border)] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {t('documents.logIncident')}
              </h3>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <Label htmlFor="incidentStaff">{t('shared.staff')}</Label>
                  <Select
                    value={incidentForm.staffId}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, staffId: value }))
                    }
                  >
                    <SelectTrigger id="incidentStaff" className="mt-1 w-full">
                      <option value="">{t('shared.unassigned')}</option>
                      {staffMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="incidentCategory">{t('documents.category')}</Label>
                  <Input
                    id="incidentCategory"
                    value={incidentForm.category}
                    onChange={(event) =>
                      setIncidentForm((prev) => ({ ...prev, category: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="incidentSeverity">{t('documents.severity')}</Label>
                  <Select
                    value={incidentForm.severity}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, severity: value }))
                    }
                  >
                    <SelectTrigger id="incidentSeverity" className="mt-1 w-full">
                      {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((level) => (
                        <option key={level} value={level}>
                          {t(`shared.severity.${level}`)}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="incidentDate">{t('documents.occurredAt')}</Label>
                  <Input
                    id="incidentDate"
                    type="datetime-local"
                    value={incidentForm.occurredAt}
                    onChange={(event) =>
                      setIncidentForm((prev) => ({ ...prev, occurredAt: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="incidentNotes">{t('shared.notes')}</Label>
                  <Textarea
                    id="incidentNotes"
                    rows={2}
                    value={incidentForm.notes}
                    onChange={(event) =>
                      setIncidentForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <div className="flex justify-end">
                  {canWriteStaff ? (
                    <Button onClick={handleCreateIncident} disabled={creatingIncident}>
                      {creatingIncident ? t('shared.saving') : t('documents.logIncidentButton')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {incidentsLoading ? (
                <p className="text-sm text-[var(--text-muted)]">
                  {t('documents.loadingIncidents')}
                </p>
              ) : incidents.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('documents.noIncidents')}</p>
              ) : (
                incidents.slice(0, 5).map((incident) => (
                  <div
                    key={incident.id}
                    className="rounded-lg border border-[var(--app-border)] bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {incident.category} · {incident.staff?.name || t('shared.unassigned')}
                      </p>
                      <Badge className="bg-[var(--red-pale)] text-[var(--red)]">
                        {incident.severity.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {format(new Date(incident.occurredAt), 'MMM d, yyyy · p')}
                    </p>
                    {incident.notes ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{incident.notes}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--app-border)] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {t('documents.performanceNotes')}
              </h3>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <Label htmlFor="performanceStaff">{t('shared.staff')}</Label>
                  <Select
                    value={performanceNoteForm.staffId}
                    onValueChange={(value) =>
                      setPerformanceNoteForm((prev) => ({
                        ...prev,
                        staffId: value,
                      }))
                    }
                  >
                    <SelectTrigger id="performanceStaff" className="mt-1 w-full">
                      <option value="">{t('shared.selectStaff')}</option>
                      {staffMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="performanceType">{t('shared.type')}</Label>
                  <Select
                    value={performanceNoteForm.noteType}
                    onValueChange={(value) =>
                      setPerformanceNoteForm((prev) => ({
                        ...prev,
                        noteType: value,
                      }))
                    }
                  >
                    <SelectTrigger id="performanceType" className="mt-1 w-full">
                      {(['KUDOS', 'COACHING', 'GENERAL'] as const).map((type) => (
                        <option key={type} value={type}>
                          {t(`shared.performanceNoteType.${type}`)}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="performanceBody">{t('documents.note')}</Label>
                  <Textarea
                    id="performanceBody"
                    rows={2}
                    value={performanceNoteForm.body}
                    onChange={(event) =>
                      setPerformanceNoteForm((prev) => ({
                        ...prev,
                        body: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex justify-end">
                  {canWriteStaff ? (
                    <Button onClick={handleCreatePerformanceNote} disabled={creatingPerformance}>
                      {creatingPerformance ? t('shared.saving') : t('documents.saveNote')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {notesLoading ? (
                <p className="text-sm text-[var(--text-muted)]">{t('documents.loadingNotes')}</p>
              ) : performanceNotes.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('documents.noNotes')}</p>
              ) : (
                performanceNotes.slice(0, 5).map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-[var(--app-border)] bg-white p-3 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {note.staff?.name} · {t(`shared.performanceNoteType.${note.noteType}`)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{note.body}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {format(new Date(note.createdAt), 'MMM d, yyyy · p')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
