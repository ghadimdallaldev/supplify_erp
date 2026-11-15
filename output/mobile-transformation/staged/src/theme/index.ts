import { Platform } from "react-native";
import { colors } from "./colors";

export const theme = {
  colors,
  spacing: { micro: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 14, xl: 22, pill: 999 },
  /** Canonical horizontal screen inset. Every screen-level edge aligns to this. */
  gutter: 20,
  touchMin: 48,
  hairline: Platform.select({ ios: 0.5, android: 1, default: 1 }) as number,
};

export const shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: "#2B1259",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
    },
    android: { elevation: 1 },
    default: {},
  }),
  /** Resting surface for cards and metric tiles: separates from the page without a heavy border. */
  card: Platform.select({
    ios: {
      shadowColor: "#2B1259",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    android: { elevation: 0 },
    default: {},
  }),
  sheet: Platform.select({
    ios: {
      shadowColor: "#2B1259",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: { elevation: 8 },
    default: {},
  }),
  brand: Platform.select({
    ios: {
      shadowColor: "#5822B4",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
    default: {},
  }),
};

export const type = {
  display: {
    fontSize: 28,
    fontWeight: "700" as const,
    letterSpacing: -0.4,
    color: colors.text,
  },
  h1: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
    color: colors.text,
  },
  h2: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "700" as const,
    letterSpacing: -0.15,
    color: colors.text,
  },
  title: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600" as const,
    color: colors.text,
  },
  /** Row title that carries an unread / unactioned state. */
  titleStrong: { fontSize: 16, fontWeight: "700" as const, color: colors.text },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 21,
    color: colors.text,
  },
  label: {
    fontSize: 13.5,
    fontWeight: "400" as const,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400" as const,
    color: colors.textFaint,
  },
  overline: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },
  metric: {
    fontSize: 26,
    lineHeight: 34,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
    fontWeight: "700" as const,
    letterSpacing: -0.4,
    color: colors.text,
  },
  /** Metric value that has to hold a formatted currency string without wrapping. */
  metricSm: {
    fontSize: 18,
    lineHeight: 25,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
    fontWeight: "700" as const,
    letterSpacing: -0.2,
    color: colors.text,
  },
};

export { colors };
