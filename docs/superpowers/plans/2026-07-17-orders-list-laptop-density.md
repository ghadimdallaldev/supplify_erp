# Orders list laptop density — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the supplier/restaurant orders table dense and usable on laptop screens.

**Architecture:** Local changes in `OrdersResponsiveList` + breakpoint prop on `ResponsiveDataList`. No shared class changes that would affect other lists unless needed.

**Tech Stack:** React, Tailwind, Vitest

---

### Task 1: Densify OrdersResponsiveList table

**Files:**

- Modify: `apps/web/src/components/orders/OrdersResponsiveList.tsx`
- Modify: `apps/web/src/pages/OrdersPage.responsive.test.tsx`

**Steps:**

1. Set `cardBreakpoint="lg"` and `tableMinWidth={880}`
2. Compact `th`/`td` classes; nowrap order `#id` link
3. Actions: `flex-nowrap`; labels `hidden 2xl:inline`
4. Relax restaurant truncate + `title`
5. Update responsive test to `expectLgCardTableSplit`
6. Run `OrdersPage.responsive.test.tsx`
