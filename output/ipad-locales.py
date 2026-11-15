from pathlib import Path
import json
root=Path('apps/web/src/i18n/locales')
messages={
 'invoices':{
  'detail.loadFailed':('Unable to load this invoice. Please try again.','تعذر تحميل هذه الفاتورة. يرجى المحاولة مجددًا.'),
  'detail.retry':('Try again','حاول مجددًا'),
  'detail.noLineItems':('No line items were recorded for this invoice.','لم يتم تسجيل بنود لهذه الفاتورة.')},
 'products':{
  'detail.quantityUnavailable':('Choose a quantity within the available stock.','اختر كمية ضمن المخزون المتاح.'),
  'detail.loadFailed':('Unable to load this product. Please try again.','تعذر تحميل هذا المنتج. يرجى المحاولة مجددًا.'),
  'detail.retry':('Try again','حاول مجددًا'),
  'detail.quantity':('Quantity','الكمية')},
 'deals':{
  'page.loadFailed':('Unable to load deals','تعذر تحميل العروض'),
  'page.loadFailedDescription':('Please try again. Your suppliers and offers could not be loaded.','تعذر تحميل الموردين والعروض. يرجى المحاولة مجددًا.'),
  'page.retry':('Try again','حاول مجددًا')},
 'inventory':{
  'toast.chooseOrderingList':('Choose an ordering list first.','اختر قائمة طلبات أولًا.'),
  'reorderList.label':('Ordering list','قائمة الطلبات'),
  'reorderList.choose':('Choose an ordering list','اختر قائمة طلبات')},
 'reservations':{
  'portal.invalidPartySize':('Choose a whole-number party size between 1 and 50.','اختر عدد ضيوف صحيحًا بين 1 و50.'),
  'portal.enterContactForWaitlist':('Enter your name and phone number to join the waitlist.','أدخل اسمك ورقم هاتفك للانضمام إلى قائمة الانتظار.')},
 'consumer':{
  'checkout.unconfirmed':('Your order status is unconfirmed. Retry to check the same order safely, or check your orders before starting another.','لم تتأكد حالة طلبك بعد. أعد المحاولة للتحقق من الطلب نفسه بأمان، أو تحقق من طلباتك قبل بدء طلب آخر.'),
  'checkout.retryOrder':('Check and retry order','تحقق من الطلب وأعد المحاولة'),
  'menu.branch':('Branch','الفرع'),
  'menu.unavailableCart':('Review your cart. Some items or customizations are no longer available at this branch.','راجع سلتك. بعض الأصناف أو الإضافات لم تعد متاحة في هذا الفرع.'),
  'menu.retry':('Try again','حاول مجددًا'),
  'rewards.loadFailed':('Unable to load your rewards. Please try again.','تعذر تحميل مكافآتك. يرجى المحاولة مجددًا.'),
  'rewards.retry':('Try again','حاول مجددًا'),
  'rewards.pointsUntilReady':('{{count}} more points to use rewards','تحتاج إلى {{count}} نقطة إضافية لاستخدام المكافآت'),
  'rewards.readyToRedeem':('Ready to use your points at checkout','يمكنك استخدام نقاطك عند إتمام الطلب'),
  'rewards.progress':('Progress toward using rewards','التقدم نحو استخدام المكافآت'),
  'rewards.redemptionCap':('Use points at checkout for up to {{percent}}% of the food subtotal.','استخدم النقاط عند إتمام الطلب لتغطية ما يصل إلى {{percent}}٪ من المجموع الفرعي للطعام.')}
}
for ns,keys in messages.items():
 for index,language in enumerate(['en','ar']):
  target=root/language/(ns+'.json'); data=json.loads(target.read_text(encoding='utf-8'))
  for key,values in keys.items():
   cursor=data; parts=key.split('.')
   for part in parts[:-1]: cursor=cursor.setdefault(part,{})
   cursor[parts[-1]]=values[index]
  target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Updated English and Arabic strings in 6 namespaces')
