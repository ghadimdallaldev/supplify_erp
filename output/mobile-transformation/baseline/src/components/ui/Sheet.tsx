import React from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadow, theme, type } from '../../theme'

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[styles.panel, shadow.sheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        <View style={styles.handle} />
        {title ? (
          <Text style={[type.h2, styles.title]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {children}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdropDark },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.sm,
    maxHeight: '88%',
  },
  title: { marginBottom: theme.spacing.md },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: theme.spacing.md,
  },
})
