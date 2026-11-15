import fs from 'node:fs'
import path from 'node:path'
const dir = 'output/readonly-mobile/'
const read = (file) => fs.readFileSync(file, 'utf8')
const save = (file, text) => fs.writeFileSync(dir + file, text)
save('assistant-types.ts', read('apps/web/src/types/assistant.ts'))
save('reorder-types.ts', read('apps/web/src/types/reorder.ts'))
for (const language of ['en','ar']) {
  const assistant = JSON.parse(read(`apps/web/src/i18n/locales/${language}/assistant.json`))
  assistant.guidance = JSON.parse(read(`apps/web/src/i18n/locales/${language}/inventory.json`)).guidance
  const additions = language === 'en' ? {
    shareAnswer:'Share / copy answer', reviewAttachments:'Please review the attached files.',
    viewCatalog:'View supplier catalog', addCart:'Add quantity to cart', addList:'Add to ordering list', chooseList:'Choose an ordering list', noLists:'Create an ordering list first.',
    showAll:'Show all', showLess:'Show less', orderBy:'Order by', pendingCheckout:'Resolve the pending checkout in your cart before adding products.', reviewProduct:'Review current product pricing, stock, and quote requirements in the supplier catalog before ordering.',
  } : {
    shareAnswer:'مشاركة أو نسخ الإجابة', reviewAttachments:'يرجى مراجعة الملفات المرفقة.',
    viewCatalog:'عرض دليل المورد', addCart:'إضافة الكمية إلى السلة', addList:'إضافة إلى قائمة الطلبات', chooseList:'اختر قائمة طلبات', noLists:'أنشئ قائمة طلبات أولاً.',
    showAll:'عرض الكل', showLess:'عرض أقل', orderBy:'موعد الطلب', pendingCheckout:'تحقق من الطلب المعلّق في السلة قبل إضافة منتجات.', reviewProduct:'راجع السعر والمخزون ومتطلبات عرض السعر في دليل المورد قبل الطلب.',
  }
  Object.assign(assistant, additions)
  save(`assistant-${language}.json`, JSON.stringify(assistant,null,2)+'\n')
}
const inventory = read('C:/myProjects/supplify-mobile/src/features/restaurant/screens/InventoryScreen.tsx')
save('InventoryScreen.tsx', (inventory.includes("import { ReorderGuidance }") ? inventory : inventory.replace("import { InventoryAdjustSheet } from './InventoryAdjustSheet'", "import { InventoryAdjustSheet } from './InventoryAdjustSheet'\nimport { ReorderGuidance } from '../components/ReorderGuidance'"))
  .replace('ListHeaderComponent={<SectionHeader style={styles.section}>Items</SectionHeader>}', 'ListHeaderComponent={<><ReorderGuidance /><SectionHeader style={styles.section}>Items</SectionHeader></>}'))
const index = read('C:/myProjects/supplify-mobile/src/services/api/queries/index.ts')
save('query-index.ts', index.includes("export * from './reorder'") ? index : index + "\nexport * from './reorder'\n")
console.log('Prepared shared read-only assistant and reorder mobile files')
