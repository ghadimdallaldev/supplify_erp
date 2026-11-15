import fs from'node:fs';import path from'node:path';
const root='C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';const file=path.join(root,'features/restaurant/screens/reservations/CreateReservationScreen.tsx');let s=fs.readFileSync(file,'utf8');
s="import { TimeField, isTimeValue } from '../../../../components/ui/TimeField'\n"+s.replace("import { DateField }", "import { DateField, parseDateKey }");
const start=s.indexOf('      <View style={styles.field}>\n        <Text style={type.label}>{uiCopy("Date & time');
const end=s.indexOf('      </View>',start)+'      </View>'.length;
if(start<0)throw Error('Booking input not found');
s=s.slice(0,start)+`      <View style={styles.field}>
        <DateField value={scheduledInput.slice(0,10)} onChange={value => setScheduledInput(value + 'T' + scheduledInput.slice(11))} />
      </View>
      <View style={styles.field}>
        <TimeField value={scheduledInput.slice(11)} onChange={value => setScheduledInput(scheduledInput.slice(0,10) + 'T' + value)} />
      </View>`+s.slice(end);
s=s.replace('    const scheduledAt = new Date(', "    if (!parseDateKey(scheduledInput.slice(0,10)) || !isTimeValue(scheduledInput.slice(11))) { Alert.alert(uiCopy('Check date and time'), uiCopy('Choose a valid date and time.')); return }\n    const scheduledAt = new Date(");
fs.writeFileSync(file,s);
const catalogue=path.join(root,'i18n/ar.json'),ar=JSON.parse(fs.readFileSync(catalogue,'utf8'));Object.assign(ar,{'Time':'الوقت','Choose time':'اختر الوقت','Use HH:mm format.':'استخدم الصيغة HH:mm.','Hour':'الساعة','Minute':'الدقيقة','Use time':'استخدام الوقت','Choose a valid date and time.':'اختر تاريخاً ووقتاً صحيحين.'});fs.writeFileSync(catalogue,JSON.stringify(ar,null,2)+'\n');
