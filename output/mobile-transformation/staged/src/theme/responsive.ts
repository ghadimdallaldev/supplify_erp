import { useWindowDimensions } from "react-native";

export const breakpoints = { expanded: 600, wide: 900 } as const;

export function useAdaptiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return {
    width,
    height,
    fontScale,
    expanded: width >= breakpoints.expanded,
    wide: width >= breakpoints.wide && fontScale < 1.6,
    gutter: width >= breakpoints.expanded ? 28 : 20,
    formWidth: 640,
  };
}
