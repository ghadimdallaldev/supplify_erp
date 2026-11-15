from pathlib import Path
import json
copy={
 'en':{'onlineUnavailable':'Online booking is currently unavailable. Please contact the restaurant to make a reservation.','contactRestaurant':'Contact the restaurant'},
 'ar':{'onlineUnavailable':'الحجز عبر الإنترنت غير متاح حاليًا. يرجى التواصل مع المطعم لإجراء حجز.','contactRestaurant':'تواصل مع المطعم'}
}
for language,entries in copy.items():
 target=Path('apps/web/src/i18n/locales')/language/'reservations.json'
 data=json.loads(target.read_text(encoding='utf-8'));data['portal'].update(entries)
 target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
