import { I18nManager, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, theme } from '../../theme'

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  onSubmit,
  right,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  onSubmit?: () => void
  /** Trailing control, e.g. a filter button that opens a sheet. */
  right?: React.ReactNode
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.wrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {value ? (
          <Pressable
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.sm,
  },
  wrap: {
    flex: 1,
    minHeight: theme.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
})
