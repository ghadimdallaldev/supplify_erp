import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Mail, Phone, Save, Loader2, Users, Calculator, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useGetSupplierMeQuery, useUpdateSupplierMutation } from '../../../../services/api'
import type { Supplier } from '../../../../types'
import { ensureNamespace } from '../../../../i18n'

type SupplierWithContacts = Supplier & {
  sales_contact_email?: string | null
  sales_contact_phone?: string | null
  accounting_contact_email?: string | null
  accounting_contact_phone?: string | null
  logistics_contact_email?: string | null
  logistics_contact_phone?: string | null
}

type ContactSectionKey = 'sales' | 'accounting' | 'logistics'

type ContactFormState = {
  sales_contact_email: string
  sales_contact_phone: string
  accounting_contact_email: string
  accounting_contact_phone: string
  logistics_contact_email: string
  logistics_contact_phone: string
}

const EMPTY_FORM: ContactFormState = {
  sales_contact_email: '',
  sales_contact_phone: '',
  accounting_contact_email: '',
  accounting_contact_phone: '',
  logistics_contact_email: '',
  logistics_contact_phone: '',
}

const CONTACT_SECTIONS: Array<{
  key: ContactSectionKey
  icon: typeof Users
  emailField: keyof ContactFormState
  phoneField: keyof ContactFormState
  emailPatchKey: 'salesContactEmail' | 'accountingContactEmail' | 'logisticsContactEmail'
  phonePatchKey: 'salesContactPhone' | 'accountingContactPhone' | 'logisticsContactPhone'
}> = [
  {
    key: 'sales',
    icon: Users,
    emailField: 'sales_contact_email',
    phoneField: 'sales_contact_phone',
    emailPatchKey: 'salesContactEmail',
    phonePatchKey: 'salesContactPhone',
  },
  {
    key: 'accounting',
    icon: Calculator,
    emailField: 'accounting_contact_email',
    phoneField: 'accounting_contact_phone',
    emailPatchKey: 'accountingContactEmail',
    phonePatchKey: 'accountingContactPhone',
  },
  {
    key: 'logistics',
    icon: Truck,
    emailField: 'logistics_contact_email',
    phoneField: 'logistics_contact_phone',
    emailPatchKey: 'logisticsContactEmail',
    phonePatchKey: 'logisticsContactPhone',
  },
]

function toFormState(supplier: SupplierWithContacts): ContactFormState {
  return {
    sales_contact_email: supplier.sales_contact_email || '',
    sales_contact_phone: supplier.sales_contact_phone || '',
    accounting_contact_email: supplier.accounting_contact_email || '',
    accounting_contact_phone: supplier.accounting_contact_phone || '',
    logistics_contact_email: supplier.logistics_contact_email || '',
    logistics_contact_phone: supplier.logistics_contact_phone || '',
  }
}

function toPatchPayload(form: ContactFormState) {
  return {
    salesContactEmail: form.sales_contact_email.trim() || null,
    salesContactPhone: form.sales_contact_phone.trim() || null,
    accountingContactEmail: form.accounting_contact_email.trim() || null,
    accountingContactPhone: form.accounting_contact_phone.trim() || null,
    logisticsContactEmail: form.logistics_contact_email.trim() || null,
    logisticsContactPhone: form.logistics_contact_phone.trim() || null,
  }
}

export function SupplierContactsTab() {
  const { t } = useTranslation('suppliers')
  const {
    data: supplierData,
    isLoading: isLoadingSupplier,
    refetch: refetchSupplier,
  } = useGetSupplierMeQuery()
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const supplier = supplierData?.supplier as SupplierWithContacts | undefined
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_FORM)

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  useEffect(() => {
    if (supplier) {
      setContactForm(toFormState(supplier))
    }
  }, [supplier])

  const handleFieldChange = (field: keyof ContactFormState, value: string) => {
    setContactForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveContacts = async () => {
    if (!supplier?.id) {
      toast.error(t('contacts.toast.notLoaded'))
      return
    }

    try {
      await updateSupplier({
        id: supplier.id,
        data: toPatchPayload(contactForm) as Partial<Supplier>,
      }).unwrap()
      toast.success(t('contacts.toast.updated'))
      refetchSupplier()
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'data' in error
          ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
          : undefined
      toast.error(message || t('contacts.toast.updateFailed'))
    }
  }

  if (isLoadingSupplier) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('contacts.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {CONTACT_SECTIONS.map((section) => {
        const Icon = section.icon
        const sectionTitle = t(`contacts.sections.${section.key}.title`)
        return (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {sectionTitle}
              </CardTitle>
              <CardDescription>{t(`contacts.sections.${section.key}.description`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${section.key}-email`}>{t('contacts.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-[var(--text-muted)]" />
                    <Input
                      id={`${section.key}-email`}
                      type="email"
                      value={contactForm[section.emailField]}
                      onChange={(e) => handleFieldChange(section.emailField, e.target.value)}
                      placeholder={t('contacts.emailPlaceholder', {
                        section: sectionTitle.toLowerCase(),
                      })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${section.key}-phone`}>{t('contacts.phone')}</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-[var(--text-muted)]" />
                    <Input
                      id={`${section.key}-phone`}
                      type="tel"
                      value={contactForm[section.phoneField]}
                      onChange={(e) => handleFieldChange(section.phoneField, e.target.value)}
                      placeholder={t('contacts.phonePlaceholder')}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Button onClick={handleSaveContacts} disabled={isUpdating} className="w-full sm:w-auto">
        {isUpdating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('contacts.saving')}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t('contacts.save')}
          </>
        )}
      </Button>
    </div>
  )
}
