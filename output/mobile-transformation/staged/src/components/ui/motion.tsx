import React, { useEffect, useRef, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";

export const motion = { press: 120, state: 180, sheet: 260 } as const;

let reduced = true;
const motionListeners = new Set<() => void>();
let subscription:
  | ReturnType<typeof AccessibilityInfo.addEventListener>
  | undefined;
const updateReducedMotion = (value: boolean) => {
  reduced = value;
  motionListeners.forEach((listener) => listener());
};
function subscribeMotion(listener: () => void) {
  motionListeners.add(listener);
  if (!subscription) {
    subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      updateReducedMotion,
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(updateReducedMotion)
      .catch(() => {});
  }
  return () => {
    motionListeners.delete(listener);
    if (!motionListeners.size) {
      subscription?.remove();
      subscription = undefined;
    }
  };
}
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => reduced,
    () => true,
  );
}

export function haptic(kind: "selection" | "success" | "error" = "selection") {
  if (Platform.OS === "web") return;
  const operation =
    kind === "selection"
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(
          kind === "success"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
  void operation.catch(() => {});
}

/** Animation changes presentation only; the original press handler owns the action. */
export function PressFeedback({
  children,
  style,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: PressableProps) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced || disabled) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [scale, reduced, disabled]);
  const animateScale = (value: number) => {
    scale.stopAnimation();
    if (reduced || disabled) scale.setValue(1);
    else
      Animated.timing(scale, {
        toValue: value,
        duration: motion.press,
        useNativeDriver: Platform.OS !== "web",
      }).start();
  };
  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={onPress}
      onPressIn={(event) => {
        animateScale(0.98);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateScale(1);
        onPressOut?.(event);
      }}
      style={style}
    >
      {(state) => (
        <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
          {typeof children === "function" ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

export function Reveal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      progress.stopAnimation();
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.state,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  const style = {
    opacity: progress,
    transform: [
      {
        translateY: reduced
          ? 0
          : progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  };
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
});
