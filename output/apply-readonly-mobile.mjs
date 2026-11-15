import fs from 'node:fs'
import path from 'node:path'
const mappings = {
  'assistant-types.ts':'src/types/assistant.ts', 'reorder-types.ts':'src/types/reorder.ts',
  'assistant-queries.ts':'src/services/api/queries/assistant.ts', 'reorder-queries.ts':'src/services/api/queries/reorder.ts',
  'AssistantScreen.tsx':'src/features/assistant/screens/AssistantScreen.tsx', 'i18n.ts':'src/features/assistant/i18n.ts',
  'assistant-en.json':'src/features/assistant/locales/en.json', 'assistant-ar.json':'src/features/assistant/locales/ar.json',
  'InventoryScreen.tsx':'src/features/restaurant/screens/InventoryScreen.tsx', 'ReorderGuidance.tsx':'src/features/restaurant/components/ReorderGuidance.tsx',
  'query-index.ts':'src/services/api/queries/index.ts',
  'AssistantScreen.test.tsx':'src/features/assistant/__tests__/AssistantScreen.test.tsx',
  'ReorderGuidance.test.tsx':'src/features/restaurant/__tests__/ReorderGuidance.test.tsx',
}
for (const root of ['C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios']) {
  const resolved = fs.realpathSync(root)
  if (resolved.toLowerCase().replaceAll('\\','/') !== root.toLowerCase()) throw new Error('Unexpected mobile workspace')
  for (const [source,target] of Object.entries(mappings)) {
    const destination = path.resolve(root,target)
    if (!destination.startsWith(path.resolve(root)+path.sep)) throw new Error('Invalid destination')
    fs.mkdirSync(path.dirname(destination),{ recursive:true })
    fs.copyFileSync(path.resolve('output/readonly-mobile',source),destination)
  }
  console.log(`Updated ${Object.keys(mappings).length} shared files in ${root}`)
}
