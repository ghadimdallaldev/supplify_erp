import React from 'react'
import { createRoot } from 'react-dom/client'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { api } from '../../apps/web/src/services/api'
import { i18n } from '../../apps/web/src/i18n'
import { ensureNamespace } from '../../apps/web/src/i18n'
import { AssistantFab } from '../../apps/web/src/components/assistant/AssistantFab'
import { ReorderAssistancePanel } from '../../apps/web/src/components/inventory/ReorderAssistancePanel'
import '../../apps/web/src/index.css'

const role = new URLSearchParams(location.search).get('role') || 'RESTAURANT'
const language = new URLSearchParams(location.search).get('lang') || 'en'
await i18n.changeLanguage(language)
await Promise.all([ensureNamespace('assistant'),ensureNamespace('inventory')])
const store = configureStore({reducer:{auth:() => ({user:{id:'11111111-1111-4111-8111-111111111111',role,tenantRoles:['Owner'],tenantPermissions:['INVENTORY_VIEW','INVENTORY_MANAGE','ORDERS_CREATE','CATALOG_VIEW'],workspace:{tenantId:'22222222-2222-4222-8222-222222222222',tenantType:role,tenantName:'Synthetic QA workspace',roleName:'Owner'}}}),[api.reducerPath]:api.reducer},middleware:(getDefault) => getDefault().concat(api.middleware)})
document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
createRoot(document.getElementById('root')!).render(<Provider store={store}><I18nextProvider i18n={i18n}><MemoryRouter><main style={{maxWidth:1100,margin:'auto',padding:24}}><h1>Supplify assistance · synthetic fixtures</h1>{role === 'RESTAURANT' && <ReorderAssistancePanel />}<AssistantFab /></main></MemoryRouter></I18nextProvider></Provider>)
