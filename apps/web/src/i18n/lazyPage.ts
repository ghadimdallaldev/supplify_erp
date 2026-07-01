import { lazy, type ComponentType } from 'react'
import type { I18nNamespace } from './config'
import { PAGE_I18N } from './pageNamespaces'
import { getActiveLocale, i18n, loadNamespaces } from './index'

type AnyComponent = ComponentType<any>

/**
 * Lazy-load a page chunk together with its i18n namespaces so the first paint
 * never shows raw key paths (e.g. "cart.page.title") while JSON loads.
 */
export function lazyPage<M extends Record<string, AnyComponent>>(
  factory: () => Promise<M>,
  exportName: keyof M & string,
  namespaces: I18nNamespace[]
) {
  return lazy(async () => {
    await loadNamespaces(i18n, getActiveLocale(), namespaces)
    const module = await factory()
    return { default: module[exportName] }
  })
}

/** Lazy page using namespace list from {@link PAGE_I18N}. */
export function lazyNamedPage<M extends Record<string, AnyComponent>>(
  factory: () => Promise<M>,
  exportName: keyof typeof PAGE_I18N & keyof M & string
) {
  return lazyPage(factory, exportName, PAGE_I18N[exportName] ?? ['common'])
}
