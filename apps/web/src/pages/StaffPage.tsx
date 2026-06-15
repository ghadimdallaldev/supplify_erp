import { useState } from 'react'
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  FileText,
  Megaphone,
  Palmtree,
  Users,
} from 'lucide-react'
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
      <PageShell className="space-y-6" data-testid="staff-page">
        <PageHeader
          title="Staff"
          description="Schedule shifts, track time, and keep your front-of-house and kitchen team aligned before service."
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as StaffTabKey)}
          className="space-y-4"
        >
          <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
            <TabsTrigger value="today" className="gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Labour today</span>
              <span className="sm:hidden">Today</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Team
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5 text-xs sm:text-sm">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Schedule & time</span>
              <span className="sm:hidden">Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="pto" className="gap-1.5 text-xs sm:text-sm">
              <Palmtree className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">PTO & availability</span>
              <span className="sm:hidden">PTO</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1.5 text-xs sm:text-sm">
              <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden md:inline">Announcements</span>
              <span className="md:hidden">News</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden md:inline">Docs & incidents</span>
              <span className="md:hidden">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Payroll & insights</span>
              <span className="sm:hidden">Reports</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            <LazyTabMount tab="today" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffTodayTab onTabChange={setActiveTab} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <LazyTabMount tab="team" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffTeamTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <LazyTabMount tab="schedule" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffScheduleTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="pto" className="space-y-4">
            <LazyTabMount tab="pto" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffPtoTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="announcements" className="space-y-4">
            <LazyTabMount
              tab="announcements"
              selectedTab={activeTab}
              fallback={<StaffTabLoading />}
            >
              <LazyStaffAnnouncementsTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <LazyTabMount tab="documents" selectedTab={activeTab} fallback={<StaffTabLoading />}>
              <LazyStaffDocumentsTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
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
