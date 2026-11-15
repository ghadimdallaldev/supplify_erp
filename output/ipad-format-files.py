from pathlib import Path
import subprocess,json
base=[
'apps/api/src/lib/cron-runner.js','apps/api/src/lib/cron-runner.test.js','apps/api/src/lib/register-cron-jobs.js','apps/api/src/lib/register-cron-jobs.test.js',
'apps/api/src/middlewares/csrf.js','apps/api/src/middlewares/csrf.test.js','apps/api/src/routes/internal-auth.routes.js','apps/api/src/routes/internal-auth.routes.test.js','apps/api/src/routes/quick-lists.routes.js','apps/api/src/routes/quick-lists.routes.test.js',
'apps/api/src/services/email/email.service.js','apps/api/src/services/email/email.service.test.js','apps/api/src/services/mailer.service.js','apps/api/src/services/mailer.service.test.js',
'apps/web/src/components/sidebar/SidebarNavSection.tsx','apps/web/src/components/sidebar/SidebarNavSection.test.tsx','apps/web/src/lib/quickListCart.ts','apps/web/src/lib/quickListCart.test.ts','apps/web/src/pages/SupplierCommandCenterPage.tsx',
'docs/features/ai-quick-lists.md','docs/features/notifications-and-alerts.md']
roots=['apps/api/src','apps/web/src','scripts/qa']
paths=[]
for args in [['diff','--name-only','--',*roots],['ls-files','--others','--exclude-standard','--',*roots]]:
 result=subprocess.run(['git',*args],capture_output=True,text=True,check=True)
 paths+=result.stdout.splitlines()
paths=[p for p in paths if p not in base and Path(p).suffix in ['.js','.jsx','.ts','.tsx','.json','.mjs']]
paths+=['docs/mobile/MOBILE_FEATURE_PARITY.md','docs/mobile/MOBILE_PARITY_CHECKLIST.md','docs/features/ai-smart-reorder.md','docs/features/reservations-foh.md','docs/features/consumer-ordering.md','docs/features/consumer-loyalty.md','docs/features/deals-and-promotions.md','docs/features/receiving.md','docs/operations/IPAD_WEB_REVIEW_2026-11-13.md','docs/onboarding/00-feature-inventory.md']
paths=sorted(set(paths))
Path('output/ipad-change-files.json').write_text(json.dumps(paths,indent=2),encoding='utf-8')
print(json.dumps({'files':len(paths)}))
