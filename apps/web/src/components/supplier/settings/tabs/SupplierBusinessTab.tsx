import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Textarea } from '../../../ui/textarea'
import { Badge } from '../../../ui/badge'
import { Clock, Save } from 'lucide-react'

export function SupplierBusinessTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Business Hours & Policies
          </CardTitle>
          <CardDescription>Set your operating hours and business policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Operating Hours</h3>
              <Badge variant="outline">Configure your weekly schedule</Badge>
            </div>
            <div className="space-y-3">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
                (day) => (
                  <div
                    key={day}
                    className="flex flex-col gap-3 p-3 border rounded-lg hover:bg-[var(--brand-ultra)] sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="w-full font-medium sm:w-28">{day}</div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <Input
                        type="time"
                        className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                        placeholder="09:00"
                      />
                      <span className="text-[var(--text-muted)]">to</span>
                      <Input
                        type="time"
                        className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                        placeholder="17:00"
                      />
                    </div>
                    <Button variant="outline" size="sm" className="w-full sm:ml-auto sm:w-auto">
                      Closed
                    </Button>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Business Policies</h3>
              <Badge variant="outline">Terms & Conditions</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum Order Value ($)</Label>
                <Input type="number" placeholder="100.00" />
                <p className="text-xs text-[var(--text-muted)]">
                  Restaurants must order at least this amount
                </p>
              </div>
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Input placeholder="Net 30" />
                <p className="text-xs text-[var(--text-muted)]">e.g., Net 30, Cash on Delivery</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Return Policy</Label>
                <Textarea placeholder="7 days return window for damaged goods..." rows={3} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Terms & Conditions</Label>
                <Textarea placeholder="Your terms and conditions for orders..." rows={4} />
              </div>
            </div>
          </div>

          <Button>
            <Save className="h-4 w-4 mr-2" />
            Save Business Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
