import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { adminEn } from './admin-i18n-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localesDir = path.join(__dirname, '../src/i18n/locales')

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

const arMap = {
  'common.loading': 'جاري التحميل…',
  'common.retry': 'إعادة المحاولة',
  'common.refresh': 'تحديث',
  'common.clearFilters': 'مسح الفلاتر',
  'common.clearFilter': 'مسح الفلتر',
  'common.clearSearch': 'مسح البحث',
  'common.clear': 'مسح',
  'common.cancel': 'إلغاء',
  'common.done': 'تم',
  'common.save': 'حفظ',
  'common.previous': 'السابق',
  'common.next': 'التالي',
  'common.filters': 'الفلاتر',
  'common.filter': 'فلتر',
  'common.actions': 'الإجراءات',
  'common.all': 'الكل',
  'common.allRoles': 'جميع الأدوار',
  'common.allStatuses': 'جميع الحالات',
  'common.allTypes': 'جميع الأنواع',
  'common.allPlans': 'جميع الخطط',
  'common.allTenantTypes': 'جميع أنواع المستأجرين',
  'common.allActionTypes': 'جميع أنواع الإجراءات',
  'common.optional': 'اختياري',
  'common.unknown': 'غير معروف',
  'common.notAvailable': 'غير متاح',
  'common.member': 'عضو',
  'common.user': 'مستخدم',
  'common.tenant': 'مستأجر',
  'common.restaurant': 'مطعم',
  'common.supplier': 'مورد',
  'common.errorDefault': 'حدث خطأ ما',
  'common.updatedAt': 'تم التحديث {{time}}',
  'common.perPage': 'لكل صفحة',
  'common.open': 'فتح',
  'common.more': '+{{count}} المزيد',
  'common.noTenantLinks': 'لا روابط مستأجر',
  'common.emDash': '—',
  'common.updating': 'جاري التحديث…',
  'common.updatingResults': 'جاري تحديث النتائج…',
  'common.updatingFeed': 'جاري تحديث التغذية…',
  'common.loadingDirectory': 'جاري تحميل الدليل…',
  'common.loadingActivity': 'جاري تحميل النشاط…',
  'common.logoutSuccess': 'تم تسجيل الخروج بنجاح',
  'common.logoutFailed': 'فشل تسجيل الخروج',
  'nav.brand': 'الإدارة',
  'nav.searchPlaceholder': 'بحث في الإدارة…',
  'users.title': 'المستخدمون',
  'overview.title': 'نظرة عامة',
  'deals.title': 'العروض والترويج',
  'operations.title': 'العمليات',
  'limits.title': 'الحدود والإضافات',
  'health.title': 'صحة النظام',
  'activity.title': 'نشاط المنصة',
  'subscriptions.title': 'الاشتراكات',
  'finance.title': 'المالية',
  'audit.title': 'سجل التدقيق',
  'features.title': 'الميزات',
}

function buildAr(enObj, prefix = '') {
  const result = {}
  for (const [key, val] of Object.entries(enObj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = buildAr(val, fullKey)
    } else {
      result[key] = arMap[fullKey] ?? val
    }
  }
  return result
}

const ar = buildAr(adminEn)

fs.writeFileSync(path.join(localesDir, 'en/admin.json'), JSON.stringify(adminEn, null, 2) + '\n')
fs.writeFileSync(path.join(localesDir, 'ar/admin.json'), JSON.stringify(ar, null, 2) + '\n')

const enKeys = flattenKeys(adminEn).sort()
const arKeys = flattenKeys(ar).sort()
console.log(`Generated ${enKeys.length} keys`)
if (JSON.stringify(enKeys) !== JSON.stringify(arKeys)) {
  const missing = enKeys.filter((k) => !arKeys.includes(k))
  console.error('Missing ar keys:', missing.slice(0, 5))
  process.exit(1)
}
