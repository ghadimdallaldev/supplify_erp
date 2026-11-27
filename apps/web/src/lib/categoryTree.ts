import type { CategoryDepartment, CategoryNode } from '../types'

/** Slug of the platform "Other" leaf: the interim home for uncategorised products. */
export const OTHER_CATEGORY_SLUG = 'other'

/** Every leaf in the tree, in department order. */
export function flattenLeaves(departments: CategoryDepartment[]): CategoryNode[] {
  return departments.flatMap((d) => d.categories)
}
