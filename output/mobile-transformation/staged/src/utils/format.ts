import { copy, getAppLocale } from "../i18n";
const displayLocale = () => (getAppLocale() === "ar" ? "ar-LB" : "en-US");
/** Lightweight display formatters shared across screens. */

export function formatMoney(
  amount: number | string | undefined | null,
  currency = "USD",
): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(displayLocale(), {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** "Jun 8, 2:14 PM" style short date for list rows. */
export function formatShortDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(displayLocale(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Relative-ish day label: Today / Yesterday / Mon, Jun 8. */
export function formatDay(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const diffDays = Math.floor(
    (today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) /
      86_400_000,
  );
  if (diffDays === 0) return copy("Today");
  if (diffDays === 1) return copy("Yesterday");
  return d.toLocaleDateString(displayLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Message-list timestamp: clock time for today, "Yesterday", weekday inside the
 * last week, then a short date. Keeps the right edge of chat rows narrow.
 */
export function formatRelativeTimestamp(
  iso: string | undefined | null,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (startOfToday - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (diffDays === 0)
    return d.toLocaleTimeString(displayLocale(), {
      hour: "numeric",
      minute: "2-digit",
    });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)
    return d.toLocaleDateString(displayLocale(), { weekday: "short" });
  return d.toLocaleDateString(displayLocale(), {
    month: "short",
    day: "numeric",
  });
}

/** Canonical short order ref: first 8 UUID chars, uppercase (matches web + notifications). */
export function orderShortId(orderId: string | undefined | null): string {
  if (!orderId) return "";
  return orderId.slice(0, 8).toUpperCase();
}

export function formatOrderRef(orderId: string | undefined | null): string {
  const short = orderShortId(orderId);
  return short ? `#${short}` : "—";
}
