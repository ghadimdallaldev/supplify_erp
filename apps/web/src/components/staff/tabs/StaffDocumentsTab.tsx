import { useState } from 'react'
import { format } from 'date-fns'
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
import { toDatetimeLocalValue } from '../staffShared'

export function StaffDocumentsTab() {
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
      toast.error('Please provide staff, type, and file URL')
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
      toast.success('Document stored')
      setDocumentForm({ staffId: '', docType: '', title: '', fileUrl: '', expiresAt: '' })
    } catch {
      toast.error('Unable to store document')
    }
  }

  const handleCreateIncident = async () => {
    if (!incidentForm.category || !incidentForm.occurredAt) {
      toast.error('Incident requires a category and time')
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
      toast.success('Incident logged')
      setIncidentForm({
        staffId: '',
        category: '',
        severity: 'LOW',
        occurredAt: toDatetimeLocalValue(new Date()),
        notes: '',
      })
    } catch {
      toast.error('Unable to log incident')
    }
  }

  const handleCreatePerformanceNote = async () => {
    if (!performanceNoteForm.staffId || !performanceNoteForm.body) {
      toast.error('Performance note requires staff and message')
      return
    }
    try {
      await createPerformanceNote({
        staffId: performanceNoteForm.staffId,
        noteType: performanceNoteForm.noteType as 'COACHING' | 'KUDOS' | 'GENERAL',
        body: performanceNoteForm.body,
      }).unwrap()
      toast.success('Performance note saved')
      setPerformanceNoteForm({ staffId: '', noteType: 'KUDOS', body: '' })
    } catch {
      toast.error('Unable to save performance note')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents & certifications</CardTitle>
          <CardDescription>Store staff paperwork and track expirations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="docStaff">Staff</Label>
              <Select
                value={documentForm.staffId}
                onValueChange={(value) => setDocumentForm((prev) => ({ ...prev, staffId: value }))}
              >
                <SelectTrigger id="docStaff" className="mt-1 w-full">
                  <option value="">Select staff</option>
                  {staffMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div>
              <Label htmlFor="docType">Type</Label>
              <Input
                id="docType"
                value={documentForm.docType}
                onChange={(event) =>
                  setDocumentForm((prev) => ({ ...prev, docType: event.target.value }))
                }
                placeholder="e.g. Food handler cert"
              />
            </div>
            <div>
              <Label htmlFor="docUrl">File URL</Label>
              <Input
                id="docUrl"
                value={documentForm.fileUrl}
                onChange={(event) =>
                  setDocumentForm((prev) => ({ ...prev, fileUrl: event.target.value }))
                }
                placeholder="https://"
              />
            </div>
            <div>
              <Label htmlFor="docExpires">Expires</Label>
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
              <Label htmlFor="docTitle">Title</Label>
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
            <Button onClick={handleCreateDocument} disabled={creatingDocument}>
              {creatingDocument ? 'Uploading…' : 'Store document'}
            </Button>
          </div>
          {documentsLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading documents…</p>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>No documents uploaded yet.</p>
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
                          ? `Expires ${format(new Date(doc.expiresAt), 'MMM d, yyyy')}`
                          : 'No expiry'}
                      </p>
                    </div>
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[var(--brand-mid)] hover:underline"
                    >
                      View file
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
          <CardTitle>Incidents & performance</CardTitle>
          <CardDescription>Track coaching, kudos, and follow-up tasks.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--app-border)] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--text)]">Log incident</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <Label htmlFor="incidentStaff">Staff</Label>
                  <Select
                    value={incidentForm.staffId}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, staffId: value }))
                    }
                  >
                    <SelectTrigger id="incidentStaff" className="mt-1 w-full">
                      <option value="">Unassigned</option>
                      {staffMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="incidentCategory">Category</Label>
                  <Input
                    id="incidentCategory"
                    value={incidentForm.category}
                    onChange={(event) =>
                      setIncidentForm((prev) => ({ ...prev, category: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="incidentSeverity">Severity</Label>
                  <Select
                    value={incidentForm.severity}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, severity: value }))
                    }
                  >
                    <SelectTrigger id="incidentSeverity" className="mt-1 w-full">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="incidentDate">Occurred at</Label>
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
                  <Label htmlFor="incidentNotes">Notes</Label>
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
                  <Button onClick={handleCreateIncident} disabled={creatingIncident}>
                    {creatingIncident ? 'Saving…' : 'Log incident'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {incidentsLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Loading incidents…</p>
              ) : incidents.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No incidents recorded.</p>
              ) : (
                incidents.slice(0, 5).map((incident) => (
                  <div
                    key={incident.id}
                    className="rounded-lg border border-[var(--app-border)] bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {incident.category} · {incident.staff?.name || 'Unassigned'}
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
              <h3 className="text-sm font-semibold text-[var(--text)]">Performance notes</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <Label htmlFor="performanceStaff">Staff</Label>
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
                      <option value="">Select staff</option>
                      {staffMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="performanceType">Type</Label>
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
                      <option value="KUDOS">Kudos</option>
                      <option value="COACHING">Coaching</option>
                      <option value="GENERAL">General</option>
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="performanceBody">Note</Label>
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
                  <Button onClick={handleCreatePerformanceNote} disabled={creatingPerformance}>
                    {creatingPerformance ? 'Saving…' : 'Save note'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {notesLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Loading notes…</p>
              ) : performanceNotes.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No notes recorded.</p>
              ) : (
                performanceNotes.slice(0, 5).map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-[var(--app-border)] bg-white p-3 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {note.staff?.name} · {note.noteType.toLowerCase()}
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
