import fs from 'node:fs'
const path = 'apps/web/src/i18n/locales/ar/'
const assistant = JSON.parse(fs.readFileSync(path + 'assistant.json', 'utf8'))
Object.assign(assistant, {
  history: 'المحادثات السابقة', noHistory: 'لا توجد محادثات محفوظة بعد.', older: 'تحميل الرسائل السابقة', previous: 'السابق', next: 'التالي',
  copy: 'نسخ الإجابة', copied: 'تم النسخ', copyFailed: 'النسخ غير متاح. حدد الإجابة لنسخها.', sourceData: 'بيانات العمل', sourceVerified: 'تم التحقق', sourceUnavailable: 'غير متاح',
  limitedResults: 'تظهر مجموعة محدودة. افتح المصدر للاطلاع على القائمة الكاملة.', attachFiles: 'إرفاق صور أو ملفات PDF', removeFile: 'إزالة {{name}}',
  fileLimits: 'اختر حتى 5 صور JPEG أو PNG أو WebP أو ملفات PDF، بحجم 10 ميغابايت لكل ملف.',
})
assistant.suggestions.attention = 'ما الذي يحتاج إلى انتباهي اليوم؟'
assistant.suggestions.reservations = 'كيف تبدو حجوزات اليوم؟'
const names = ['المخزون','نظرة عامة على المطعم','نظرة عامة على المورد','الطلبات','تفاصيل الطلب','تتبع التوصيل','الفواتير','إرشادات إعادة الطلب','دليل المنتجات','الموردون المتابَعون','أسعار الموردين','الحجوزات','الأوقات المتاحة للحجز','تنفيذ الطلبات','مخزون المستودع','الوصفات','التقارير','الهدر','سجل الأسعار','تغيّرات الأسعار','تحليل الهدر','موثوقية المورد','هوامش الوصفات','المخزون الزائد','اختلافات الفواتير','مقارنة الفروع','اقتراحات النقل','توقع الطلب','مخاطر نفاد المخزون','فرص العملاء','فرص العروض','أداء المستودعات','توقعات المستودعات','الملخص الأسبوعي','المخزون بطيء الحركة','نظرة عامة على المنصة']
Object.keys(assistant.sources).forEach((key,i) => { assistant.sources[key] = names[i] })
fs.writeFileSync(path + 'assistant.json', JSON.stringify(assistant, null, 2) + '\n')
const inventory = JSON.parse(fs.readFileSync(path + 'inventory.json', 'utf8'))
inventory.guidance = {
  title: 'المساعدة في إعادة الطلب', description: 'إرشادات شراء واضحة تعتمد على المخزون والتوريدات القادمة والاستهلاك وأنماط الشراء.',
  search: 'البحث عن منتج', status: 'الخطوة التالية', all: 'كل الاقتراحات', supplier: 'المورد', allSuppliers: 'كل الموردين', refresh: 'تحديث البيانات',
  aiReview: 'مراجعة بالذكاء الاصطناعي', aiLoading: 'تجري المراجعة…', aiFailed: 'المراجعة الذكية غير متاحة. تبقى إرشادات التوقع متاحة.', showing: 'عرض {{count}} من {{total}} اقتراحات',
  noMatches: 'لا توجد اقتراحات تطابق عوامل التصفية.', empty: 'لا توجد اقتراحات لإعادة الطلب حالياً.', suggested: 'الكمية المقترحة', onHand: 'المتوفر', incoming: 'الوارد المتوقع',
  expectedUsage: 'الاستهلاك المتوقع', netNeed: 'الاحتياج الصافي', unknown: 'غير معروف', reviewBeforeOrdering: 'راجع المخزون والكميات قبل الطلب.',
  actions: { order: 'اشترِ الآن', wait: 'راقب المخزون', manual_review: 'راجع البيانات' }, quality: { good: 'بيانات كافية', fair: 'بيانات محدودة', poor: 'تحتاج إلى مراجعة' },
  scope: { restaurant: 'مخزون المطعم بالكامل', branch: 'مخزون الفرع' },
  warnings: {
    incoming_unknown: 'تعذر التحقق من التوريدات القادمة. راجع الطلبات المفتوحة قبل الشراء.', incoming_overdue: 'بعض التوريدات متأخرة ولم تُحتسب ضمن الوارد المؤكد.',
    incoming_uncertain: 'بعض الطلبات دون موعد توصيل مؤكد ولم تُحتسب ضمن الوارد المؤكد.', limited_history: 'سجل الاستهلاك محدود. تحقق من الكمية المطلوبة.',
    review_expiry: 'راجع المخزون القريب من انتهاء الصلاحية قبل الشراء.', cadence_only: 'هذا التذكير يعتمد على نمط الطلبات وليس الاستهلاك المقاس.',
    shared_stock: 'المخزون مشترك للمطعم. يلزم جرد للفرع قبل اقتراح كمية خاصة به.', incoming_after_stockout: 'قد ينفد المخزون قبل التوريد القادم. تحقق من توصيل أبكر أو شراء كمية مؤقتة.',
  },
}
fs.writeFileSync(path + 'inventory.json', JSON.stringify(inventory, null, 2) + '\n')
