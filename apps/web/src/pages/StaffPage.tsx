import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

import { RequirePermission } from '../components/RequirePermission'

import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'

import { LazyTabMount } from '../components/LazyTabMount'

import { StaffTabLoading, type StaffTabKey } from '../components/staff/staffShared'

import {
  LazyStaffAnnouncementsTab,
  LazyStaffDocumentsTab,
  LazyStaffPtoTab,
  LazyStaffReportsTab,
  LazyStaffScheduleTab,
  LazyStaffTeamTab,
  LazyStaffTodayTab,
} from '../components/staff/lazyStaffTabs'

export function StaffPage() {
  const [activeTab, setActiveTab] = useState<StaffTabKey>('today')

  return (
    <RequirePermission permission="STAFF_VIEW" title="staff management">
      <PageShell data-testid="staff-page">
        <PageHeader
          title="Staff operations"
          description="Schedule shifts, manage time, and keep your team aligned. This is the manager view — staff use their own portal at /staff/dashboard."
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as StaffTabKey)}
          className="w-full"
        >
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="today">Labour Today</TabsTrigger>

            <TabsTrigger value="team">Team</TabsTrigger>

            <TabsTrigger value="schedule">Schedule & time</TabsTrigger>

            <TabsTrigger value="pto">PTO & availability</TabsTrigger>

            <TabsTrigger value="announcements">Announcements</TabsTrigger>

            <TabsTrigger value="documents">Docs & incidents</TabsTrigger>

            <TabsTrigger value="reports">Payroll & insights</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            <LazyTabMount tab="today" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffTodayTab onTabChange={setActiveTab} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <LazyTabMount tab="team" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffTeamTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <LazyTabMount tab="schedule" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffScheduleTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="pto" className="space-y-6">
            <LazyTabMount tab="pto" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffPtoTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="announcements" className="space-y-6">
            <LazyTabMount
              tab="announcements"
              selectedTab={activeTab}
              fallback={<StaffTabLoading />}
            >
              <LazyStaffAnnouncementsTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <LazyTabMount tab="documents" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffDocumentsTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <LazyTabMount tab="reports" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffReportsTab />
            </LazyTabMount>
          </TabsContent>
        </Tabs>
      </PageShell>
    </RequirePermission>
  )
}

export default StaffPage
