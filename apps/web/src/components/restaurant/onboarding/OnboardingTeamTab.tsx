import { useState } from 'react'
import { Button } from '../../ui/button'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppSelector } from '../../../hooks/redux'
import {
  useGetRestaurantTeamQuery,
  useDeleteRestaurantTeamMemberMutation,
} from '../../../services/api'
import { TeamRolesPanel } from '../../TeamRolesPanel'
import { RestaurantMemberInviteModal } from '../../org/RestaurantMemberInviteModal'
import { RestaurantPendingInvitations } from '../../org/RestaurantPendingInvitations'
import { OnboardingTabLoading } from './onboardingShared'

export function OnboardingTeamTab() {
  const { user } = useAppSelector((state) => state.auth)
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const {
    data: teamData,
    isLoading: isLoadingTeam,
    refetch: refetchTeam,
  } = useGetRestaurantTeamQuery(undefined, { skip: !user?.id })
  const [deleteTeamMember] = useDeleteRestaurantTeamMemberMutation()
  const teamMembers = teamData?.team ?? []

  const handleRemoveMember = async (memberId: string) => {
    try {
      await deleteTeamMember(memberId).unwrap()
      refetchTeam()
      toast.success('Member removed')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to remove member')
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
