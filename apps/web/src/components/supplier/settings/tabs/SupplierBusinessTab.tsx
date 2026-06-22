import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Textarea } from '../../../ui/textarea'
import { Badge } from '../../../ui/badge'
import { Clock, Save } from 'lucide-react'
import { ensureNamespace } from '../../../../i18n'

const BUSINESS_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export function SupplierBusinessTab() {
  const { t } = useTranslation('suppliers')

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('business.title')}
          </CardTitle>
          <CardDescription>{t('business.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{t('business.operatingHours')}</h3>
              <Badge variant="outline">{t('business.configureSchedule')}</Badge>
            </div>
            <div className="space-y-3">
              {BUSINESS_DAY_KEYS.map((dayKey) => (
                <div
                  key={dayKey}
                  className="flex flex-col gap-3 p-3 border rounded-lg hover:bg-[var(--brand-ultra)] sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="w-full font-medium sm:w-28">{t(`business.days.${dayKey}`)}</div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <Input
                      type="time"
                      className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                      placeholder="09:00"
                    />
                    <span className="text-[var(--text-muted)]">{t('business.to')}</span>
                    <Input
                      type="time"
                      className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                      placeholder="17:00"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="w-full sm:ml-auto sm:w-auto">
                    {t('business.closed')}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{t('business.policies')}</h3>
              <Badge variant="outline">{t('business.termsBadge')}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('business.minOrderValue')}</Label>
                <Input type="number" placeholder="100.00" />
                <p className="text-xs text-[var(--text-muted)]">{t('business.minOrderHint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('business.paymentTerms')}</Label>
                <Input placeholder={t('business.paymentTermsPlaceholder')} />
                <p className="text-xs text-[var(--text-muted)]">{t('business.paymentTermsHint')}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('business.returnPolicy')}</Label>
                <Textarea placeholder={t('business.returnPolicyPlaceholder')} rows={3} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('business.termsConditions')}</Label>
                <Textarea placeholder={t('business.termsPlaceholder')} rows={4} />
              </div>
            </div>
          </div>

          <Button>
            <Save className="h-4 w-4 mr-2" />
            {t('business.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
