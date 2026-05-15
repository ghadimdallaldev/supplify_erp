import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

export function PublicReservationConfirmation() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900/90 px-4 py-16 text-white">
      <Card className="w-full max-w-xl border-white/10 bg-white/95 text-[var(--text-muted)] shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold tracking-tight">Reservation confirmed</CardTitle>
          <CardDescription>
            Thanks for booking with Supplify. A confirmation will be sent shortly. Keep this page handy if you need to
            manage your visit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {token ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text-muted)]">
                Use the reference token below when contacting the restaurant or to manage your reservation.
              </p>
              <Badge variant="outline" className="text-lg tracking-wider">
                {token}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Your reservation is confirmed. A management link was provided on the previous step.
            </p>
          )}

          <div className="space-y-2">
            <p className="text-sm text-[var(--text-muted)]">
              Need to make changes? Keep an eye on your inbox for update instructions or contact the host team directly.
            </p>
            <Link to="/reserve" className="inline-flex">
              <Button variant="outline">Book another table</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default PublicReservationConfirmation

