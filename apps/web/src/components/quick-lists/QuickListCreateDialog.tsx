import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'

export function QuickListCreateDialog(props: any) {
  const { t } = useTranslation('cart')
  const {
    showCreateDialog,
    setShowCreateDialog,
    newListName,
    setNewListName,
    newListDescription,
    setNewListDescription,
    handleCreateList,
  } = props

  return (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('quickLists.createDialog.title')}</DialogTitle>
          <DialogDescription>{t('quickLists.createDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('quickLists.createDialog.name')} *</Label>
            <Input
              id="name"
              placeholder={t('quickLists.createDialog.namePlaceholder')}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('quickLists.createDialog.descriptionLabel')}</Label>
            <Textarea
              id="description"
              placeholder={t('quickLists.createDialog.descriptionPlaceholder')}
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-md border border-[var(--app-border)] bg-[var(--brand-ultra)] p-4">
            <p className="text-sm text-[var(--brand-mid)]">
              <strong>{t('quickLists.createDialog.tipLabel')}</strong>{' '}
              {t('quickLists.createDialog.tipBody')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
            {t('quickLists.createDialog.cancel')}
          </Button>
          <Button onClick={handleCreateList} disabled={!newListName.trim()}>
            {t('quickLists.createDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
