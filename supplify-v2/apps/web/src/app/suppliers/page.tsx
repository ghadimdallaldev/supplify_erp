import { AuthGuard } from '@/components/auth-guard'
import { SuppliersPage } from '@/components/suppliers-page'

export default function Suppliers() {
  return (
    <AuthGuard>
      <SuppliersPage />
    </AuthGuard>
  )
}
