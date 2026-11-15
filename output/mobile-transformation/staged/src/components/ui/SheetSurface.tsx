import { useAppLocale as useUiLocale } from "../../i18n";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { colors, theme, type } from "../../theme";
import { useAdaptiveLayout } from "../../theme/responsive";
import { copy, useAppLocale } from "../../i18n";
import { Text } from "./primitives";
import { motion, useReducedMotion } from "./motion";

export function SheetSurface({
  visible,
  onClose,
  title,
  children,
  dismissible = true,
  scrollable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  scrollable?: boolean;
}) {
  useUiLocale();

  useAppLocale();
  const insets = useSafeAreaInsets();
  const { expanded } = useAdaptiveLayout();
  const reduced = useReducedMotion();
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    offset.stopAnimation();
    offset.setValue(visible && !reduced ? 32 : 0);
    if (!visible || reduced) return;
    const animation = Animated.timing(offset, {
      toValue: 0,
      duration: motion.sheet,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [visible, reduced, offset]);
  const animatedStyle = {
    transform: [
      {
        translateY: offset.interpolate({
          inputRange: [0, 10000],
          outputRange: [0, 10000],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  // Native gesture events drive the transform without a JS callback per frame.
  const onGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { translationY: offset } }], {
        useNativeDriver: Platform.OS !== "web",
      }),
    [offset],
  );
  const onGestureStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const { state, translationY, velocityY } = event.nativeEvent;
    if (state === State.BEGAN) offset.stopAnimation();
    if (
      state !== State.END &&
      state !== State.CANCELLED &&
      state !== State.FAILED
    )
      return;
    if (
      state === State.END &&
      dismissible &&
      (translationY > 110 || velocityY > 800)
    )
      onClose();
    else if (reduced) offset.setValue(0);
    else
      Animated.timing(offset, {
        toValue: 0,
        duration: motion.state,
        useNativeDriver: Platform.OS !== "web",
      }).start();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={dismissible ? onClose : () => {}}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.root}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? onClose : undefined}
            disabled={!dismissible}
            accessibilityRole="button"
            accessibilityLabel={copy("Close")}
          />
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              expanded && styles.expanded,
              { paddingBottom: insets.bottom + 16 },
              animatedStyle,
            ]}
          >
            <PanGestureHandler
              enabled={dismissible}
              onGestureEvent={onGestureEvent}
              onHandlerStateChange={onGestureStateChange}
            >
              <View style={styles.dragArea} accessible={false}>
                <View style={styles.handle} />
              </View>
            </PanGestureHandler>
            <View style={styles.heading}>
              {title ? (
                <Text
                  style={[type.h2, styles.title]}
                  accessibilityRole="header"
                >
                  {title}
                </Text>
              ) : (
                <View style={styles.title} />
              )}
              <Pressable
                onPress={onClose}
                disabled={!dismissible}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel={copy("Close")}
                accessibilityState={{ disabled: !dismissible }}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            {scrollable ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.body}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={{ flexShrink: 1 }}>{children}</View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.backdropDark,
  },
  panel: {
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderTopStartRadius: 22,
    borderTopEndRadius: 22,
    overflow: "hidden",
  },
  expanded: {
    width: 560,
    maxHeight: "85%",
    alignSelf: "center",
    marginBottom: 28,
    borderRadius: 22,
  },
  dragArea: { height: 24, justifyContent: "center", alignItems: "center" },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  title: { flex: 1 },
  close: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
});
