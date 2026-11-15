import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useCreatePromotion, usePromotionPricing } from '../../../services/api/queries'
import { Card, LoadingState, Screen } from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import { colors, theme } from '../../../theme'

const RESTAURANT_TYPES = [
  'fine_dining',
  'casual_dining',
  'fast_food',
  'cafe',
  'bakery',
  'hotel',
  'catering',
  'cloud_kitchen',
] as const

const DEAL_TYPES = [
  { key: 'percentage_discount', label: 'Percentage off' },
  { key: 'fixed_discount', label: 'Fixed amount off' },
  { key: 'free_shipping', label: 'Free delivery' },
] as const

type DealType = (typeof DEAL_TYPES)[number]['key']

export function CreateDealScreen() {
  const navigation = useNavigation<any>()
  const createPromotion = useCreatePromotion()
  const pricingQuery = usePromotionPricing()
  const packages = pricingQuery.data ?? []

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dealType, setDealType] = useState<DealType>('percentage_discount')
  const [discountValue, setDiscountValue] = useState('10')
  const [pricingKey, setPricingKey] = useState('')
  const [restaurantTypes, setRestaurantTypes] = useState<string[]>([])
  const [areas, setAreas] = useState<string[]>([])
  const [areaDraft, setAreaDraft] = useState('')

  const recommended = useMemo(
    () => packages.find((p) => p.is_recommended) || packages[0],
    [packages]
  )

  if (pricingQuery.isLoading) return <LoadingState />

  const toggleType = (type: string) => {
    setRestaurantTypes((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type]
    )
  }

  const addArea = () => {
    const area = areaDraft.trim()
    if (!area) return
    setAreas((prev) => (prev.includes(area) ? prev : [...prev, area]))
    setAreaDraft('')
  }

  const handleCreate = async (submitForReview: boolean) => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give your deal a name.')
      return
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Explain what the deal includes and who it is for.')
      return
    }

    const discount = Number(discountValue)
    if (dealType !== 'free_shipping') {
      if (!Number.isFinite(discount) || discount <= 0) {
        Alert.alert('Discount required', 'Enter a discount greater than zero.')
        return
      }
      if (dealType === 'percentage_discount' && discount > 100) {
        Alert.alert('Invalid discount', 'Percentage discounts cannot exceed 100%.')
        return
      }
    }

    const key = pricingKey || recommended?.pricing_key
    if (submitForReview && !key) {
      Alert.alert('Boost required', 'Select a boost package before submitting.')
      return
    }

    try {
      await createPromotion.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        type: dealType,
        discountValue: dealType === 'free_shipping' ? undefined : discount,
        startsAt: new Date().toISOString(),
        appliesTo: 'all',
        targetRestaurantTypes: restaurantTypes.length ? restaurantTypes : undefined,
        targetAreas: areas.length ? areas : undefined,
        submitForReview,
        pricingKey: submitForReview ? key : undefined,
      })
      Alert.alert(
        submitForReview ? 'Submitted' : 'Draft saved',
        submitForReview
          ? 'Deal sent for approval with its selected boost package.'
          : 'Draft saved. Submit with a boost when ready.'
      )
      navigation.goBack()
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save deal')
    }
  }

  return (
    <Screen title="Create deal" subtitle="Define the offer, audience, and boost">
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.label}>Deal name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Weekend produce special"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>What is this deal about?</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the products, value, and any important conditions"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
          textAlignVertical="top"
        />

        <Text style={styles.section}>Deal type</Text>
        <View style={styles.chips}>
          {DEAL_TYPES.map((item) => {
            const selected = dealType === item.key
            return (
              <Pressable
                key={item.key}
                onPress={() => setDealType(item.key)}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {dealType !== 'free_shipping' ? (
          <>
            <Text style={styles.label}>
              {dealType === 'percentage_discount' ? 'Discount %' : 'Discount amount'}
            </Text>
            <TextInput
              style={styles.input}
              value={discountValue}
              onChangeText={setDiscountValue}
              keyboardType="decimal-pad"
              placeholder={dealType === 'percentage_discount' ? '10' : '5.00'}
              placeholderTextColor={colors.textMuted}
            />
          </>
        ) : null}

        <Text style={styles.section}>Who sees this boost</Text>
        <Text style={styles.hint}>
          Optional. Empty means all eligible restaurants. Areas match city, neighborhood, or region.
        </Text>
        <View style={styles.chips}>
          {RESTAURANT_TYPES.map((type) => {
            const selected = restaurantTypes.includes(type)
            return (
              <Pressable
                key={type}
                onPress={() => toggleType(type)}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                  {type.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <View style={styles.areaRow}>
          <TextInput
            style={[styles.input, styles.areaInput]}
            value={areaDraft}
            onChangeText={setAreaDraft}
            placeholder="Area e.g. Beirut"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={addArea}
          />
          <Pressable onPress={addArea} style={styles.addArea}>
            <Text style={styles.addAreaText}>Add</Text>
          </Pressable>
        </View>
        {areas.length ? (
          <View style={styles.chips}>
            {areas.map((area) => (
              <Pressable
                key={area}
                onPress={() => setAreas((prev) => prev.filter((value) => value !== area))}
                style={[styles.chip, styles.chipOn]}
              >
                <Text style={[styles.chipText, styles.chipTextOn]}>{area} ×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.section}>Boost package</Text>
        {packages.map((pkg) => {
          const selected = (pricingKey || recommended?.pricing_key) === pkg.pricing_key
          return (
            <Pressable key={pkg.pricing_key} onPress={() => setPricingKey(pkg.pricing_key)}>
              <Card style={{ ...styles.pkg, ...(selected ? styles.pkgOn : null) }}>
                <Text style={styles.pkgTitle}>{pkg.display_name || pkg.pricing_key}</Text>
                <Text style={styles.pkgMeta}>
                  {formatMoney(Number(pkg.amount || 0))} · {pkg.duration_days || 0} days
                </Text>
              </Card>
            </Pressable>
          )
        })}

        <Pressable
          style={[styles.primary, createPromotion.isPending && styles.disabled]}
          disabled={createPromotion.isPending}
          onPress={() => void handleCreate(true)}
        >
          <Text style={styles.primaryText}>Submit with boost</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          disabled={createPromotion.isPending}
          onPress={() => void handleCreate(false)}
        >
          <Text style={styles.secondaryText}>Save draft</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { paddingBottom: theme.spacing.xxl, gap: 8 },
  label: { fontWeight: '700', color: colors.text, marginTop: 8 },
  section: { fontWeight: '800', color: colors.text, marginTop: 16, fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  descriptionInput: { minHeight: 96 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  chipText: { fontSize: 12, color: colors.text, textTransform: 'capitalize' },
  chipTextOn: { fontWeight: '700', color: colors.brand },
  areaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  areaInput: { flex: 1 },
  addArea: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addAreaText: { color: colors.onBrand, fontWeight: '700' },
  pkg: { marginBottom: 8 },
  pkgOn: { borderColor: colors.brand, borderWidth: 1.5 },
  pkgTitle: { fontWeight: '700', color: colors.text },
  pkgMeta: { marginTop: 2, color: colors.textMuted, fontSize: 13 },
  primary: {
    marginTop: 16,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: colors.onBrand, fontWeight: '800' },
  secondary: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.brand, fontWeight: '700' },
  disabled: { opacity: 0.6 },
})
