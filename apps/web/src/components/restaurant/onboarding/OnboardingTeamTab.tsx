import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppSelector } from '../../../hooks/redux'
import {
  useGetRestaurantTeamQuery,
  useDeleteRestaurantTeamMemberMutation,
} from '../../../services/api'
import { TeamRolesPanel } from '../../TeamRolesPanel'
import { RestaurantMemberInviteModal } from '../../org/RestaurantMemberInviteModal'
import { RestaurantPendingInvitations } from '../../org/RestaurantPendingInvitations'
import { OnboardingTabLoading } from './onboardingShared'
import { ensureNamespace } from '../../../i18n'

export function OnboardingTeamTab() {
  const { t } = useTranslation('onboarding')
  const { user } = useAppSelector((state) => state.auth)
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const {
    data: teamData,
    isLoading: isLoadingTeam,
    refetch: refetchTeam,
  } = useGetRestaurantTeamQuery(undefined, { skip: !user?.id })
  const [deleteTeamMember] = useDeleteRestaurantTeamMemberMutation()
  const teamMembers = teamData?.team ?? []

  useEffect(() => {
    void ensureNamespace('onboarding')
  }, [])

  const handleRemoveMember = async (memberId: string) => {
    try {
      await deleteTeamMember(memberId).unwrap()
      refetchTeam()
      toast.success(t('restaurantTeam.toast.memberRemoved'))
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('restaurantTeam.toast.removeFailed'))
    }
  }

  if (isLoadingTeam) {
    return <OnboardingTabLoading />
  }

  return (
    <>
      <div className="space-y-4">
        <TeamRolesPanel
          tenantType="RESTAURANT"
          teamMembers={teamMembers}
          teamMembersLoading={isLoadingTeam}
          onRemoveMember={handleRemoveMember}
          renderInviteForm={() => (
            <Button className="mt-2" onClick={() => setShowAddMemberDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Invite via Link
            </Button>
          )}
        />
        <RestaurantPendingInvitations />
      </div>
      <RestaurantMemberInviteModal
        open={showAddMemberDialog}
        onClose={() => setShowAddMemberDialog(false)}
      />
    </>
  )
}
