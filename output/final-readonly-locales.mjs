import fs from 'node:fs'
for (const language of ['en','ar']) {
  const root=`apps/web/src/i18n/locales/${language}/`
  const assistant=JSON.parse(fs.readFileSync(root+'assistant.json','utf8'))
  assistant.serviceUnavailable=language==='ar'?'المساعد غير متاح حالياً. تحقق من الاتصال أو حاول لاحقاً.':'The assistant is temporarily unavailable. Check your connection or try again later.'
  fs.writeFileSync(root+'assistant.json',JSON.stringify(assistant,null,2)+'\n')
  const inventory=JSON.parse(fs.readFileSync(root+'inventory.json','utf8'))
  inventory.guidance.orderBy=language==='ar'?'موعد الطلب':'Order by'
  fs.writeFileSync(root+'inventory.json',JSON.stringify(inventory,null,2)+'\n')
}
