import React, { forwardRef } from "react";
import {
  Platform,
  Text as NativeText,
  TextInput as NativeInput,
  type TextProps,
  type TextInputProps,
  StyleSheet,
} from "react-native";
import { colors } from "../../theme/colors";
import { useAppLocale } from "../../i18n";

export type Text = NativeText;
export type TextInput = NativeInput;

const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
});

/** Presentation defaults only. Server content is never translated here. */
export const Text = forwardRef<NativeText, TextProps>(function Text(
  { style, ...props },
  ref,
) {
  const locale = useAppLocale();
  return (
    <NativeText
      ref={ref}
      {...props}
      style={[styles.text, style, locale === "ar" && styles.arabic]}
    />
  );
});

export const TextInput = forwardRef<NativeInput, TextInputProps>(
  function TextInput(
    { style, placeholderTextColor, onChangeText, ...props },
    ref,
  ) {
    const locale = useAppLocale();
    const numeric = ["numeric", "number-pad", "decimal-pad"].includes(
      props.keyboardType ?? "",
    );
    return (
      <NativeInput
        ref={ref}
        {...props}
        onChangeText={
          onChangeText
            ? (value) =>
                onChangeText(
                  numeric
                    ? value
                        .replace(/[٠-٩۰-۹]/g, (digit) =>
                          String(
                            digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632),
                          ),
                        )
                        .replace(/٫/g, ".")
                        .replace(/٬/g, "")
                    : value,
                )
            : undefined
        }
        accessibilityLabel={props.accessibilityLabel ?? props.placeholder}
        placeholderTextColor={placeholderTextColor ?? colors.textFaint}
        style={[
          styles.input,
          style,
          locale === "ar" && {
            ...styles.arabicInput,
            ...(StyleSheet.flatten(style)?.textAlign === "center"
              ? { textAlign: "center" }
              : {}),
          },
        ]}
      />
    );
  },
);

const styles = StyleSheet.create({
  text: {
    fontFamily,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
  },
  arabic: { writingDirection: "rtl", letterSpacing: 0 },
  input: {
    fontFamily,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    textAlignVertical: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  arabicInput: { writingDirection: "rtl", textAlign: "right" },
});
