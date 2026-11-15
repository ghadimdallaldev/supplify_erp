from pathlib import Path
import json
root=Path(r'C:/myProjects/supplify_erp')
repos=[Path(r'C:/myProjects/supplify-mobile'),Path(r'C:/myProjects/supplify-mobile-ios')]
updated=[]
for repo in repos:
    replacements={
      'src/types/promotions.ts':[("  discount_value?: number\n", "  discount_value?: number | string | null\n")],
      'src/services/api/queries/promotions.ts':[("import { queryKeys, qs } from './keys'", "import { queryKeys, qs } from './keys'\nimport { unwrapActiveDeals } from '../../../lib/dealDisplay'"),("      return data.deals ?? data.promotions ?? []", "      return unwrapActiveDeals(data)")],
      'src/features/restaurant/screens/DealsScreen.tsx':[("Card, EmptyState, FlashList, LoadingState, Screen", "Card, EmptyState, ErrorState, FlashList, LoadingState, Screen"),("import { formatDay, formatMoney }", "import { formatDay }"),("import { colors, theme, type } from '../../../theme'", "import { colors, theme, type } from '../../../theme'\nimport { activeDealDiscountLabel } from '../../../lib/dealDisplay'"),("const { data: deals, isLoading } = useActiveDeals()", "const { data: deals, isLoading, isError, isRefetching, refetch } = useActiveDeals()"),("  const rows = deals ?? []", "  if (isError) return (\n    <Screen title=\"Deals\" subtitle=\"Active promotions from suppliers\">\n      <ErrorState title=\"Unable to load deals\" message=\"Your offers could not be loaded. Please try again.\" onRetry={() => { void refetch() }} />\n    </Screen>\n  )\n\n  const rows = deals ?? []"),("        data={rows}", "        data={rows}\n        refreshing={isRefetching}\n        onRefresh={() => { void refetch() }}")]
    }
    for relative,pairs in replacements.items():
        target=repo/relative
        source=target.read_text(encoding='utf-8')
        for before,after in pairs:
            if before not in source: raise RuntimeError(f'Missing expected source: {target}: {before}')
            source=source.replace(before,after,1)
        if relative.endswith('DealsScreen.tsx'):
            start=source.index('  const discount =\n')
            end=source.index('\n\n  return (',start)
            source=source[:start]+'  const discount = activeDealDiscountLabel(deal)'+source[end:]
        target.write_text(source,encoding='utf-8',newline='\n')
        updated.append(str(target))
    for name in ['dealDisplay.ts','dealDisplay.test.ts']:
        target=repo/'src/lib'/name
        target.write_bytes((root/'output'/('ipad-native-'+name)).read_bytes())
        updated.append(str(target))
print(json.dumps({'updated':updated}))
