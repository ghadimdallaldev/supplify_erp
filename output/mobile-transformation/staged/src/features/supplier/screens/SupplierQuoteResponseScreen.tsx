import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { SupplierStackParamList } from "../../../navigation/SupplierNavigator";
import {
  useSubmitSupplierQuoteResponse,
  useSupplierQuoteRequest,
} from "../../../services/api/queries";
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from "../../../components/ui";
import { colors, theme, type } from "../../../theme";

type Draft = {
  available: boolean;
  price: string;
  quantity: string;
  note: string;
};

export function SupplierQuoteResponseScreen() {
  useUiLocale();

  const route = useRoute<RouteProp<SupplierStackParamList, "QuoteResponse">>();
  const navigation = useNavigation();
  const query = useSupplierQuoteRequest(route.params.quoteRequestSupplierId);
  const submitResponse = useSubmitSupplierQuoteResponse();
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (!query.data || Object.keys(drafts).length) return;
    const responseByItem = new Map(
      (query.data.response?.items ?? []).map((item) => [
        item.quoteRequestItemId,
        item,
      ]),
    );
    setNote(query.data.response?.note ?? "");
    setDrafts(
      Object.fromEntries(
        query.data.items.map((item) => {
          const existing = responseByItem.get(item.id);
          return [
            item.id,
            {
              available: existing?.isAvailable ?? true,
              price:
                existing?.unitPrice != null ? String(existing.unitPrice) : "",
              quantity: String(existing?.quantity ?? item.quantity),
              note: existing?.note ?? "",
            },
          ];
        }),
      ),
    );
  }, [query.data, drafts]);

  if (query.isLoading) return <LoadingState />;
  if (!query.data) {
    return (
      <Screen form title={uiCopy("Quote response")}>
        <EmptyState title={uiCopy("Request unavailable")} />
      </Screen>
    );
  }

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const submit = async () => {
    for (const item of query.data!.items) {
      const draft = drafts[item.id];
      if (draft?.available && (!draft.price || Number(draft.price) < 0)) {
        Alert.alert(
          uiCopy("Price required"),
          uiCopy("Enter a valid price for {{v0}}.", { v0: item.productName }),
        );
        return;
      }
    }
    try {
      await submitResponse.mutateAsync({
        quoteRequestSupplierId: query.data.id,
        note: note.trim() || undefined,
        items: query.data.items.map((item) => {
          const draft = drafts[item.id];
          return {
            quoteRequestItemId: item.id,
            isAvailable: draft?.available ?? false,
            unitPrice: draft?.available ? Number(draft.price) : null,
            currency:
              query.data.defaultCurrency ||
              query.data.response?.items?.[0]?.currency ||
              "USD",
            quantity: draft?.available
              ? Number(draft.quantity || item.quantity)
              : null,
            note: draft?.note.trim() || null,
          };
        }),
      });
      Alert.alert(
        uiCopy("Quote sent"),
        uiCopy("The restaurant can now compare your response."),
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        uiCopy("Could not send quote"),
        error instanceof Error ? error.message : uiCopy("Try again."),
      );
    }
  };

  const readOnly =
    query.data.canRespond === false || query.data.status === "responded";
  const lockedBanner =
    readOnly && query.data.status !== "responded"
      ? query.data.status === "declined"
        ? "You declined this quote request."
        : `This quote request is ${query.data.quoteRequestStatus ?? "closed"} and no longer accepts responses.`
      : null;

  return (
    <Screen
      form
      title={query.data.restaurantName}
      subtitle={uiCopy("Quote request")}
      scroll
      right={<StatusPill status={query.data.status} />}
    >
      {lockedBanner ? (
        <Text style={styles.lockedBanner}>{lockedBanner}</Text>
      ) : null}
      {query.data.neededBy ? (
        <Text style={styles.meta}>
          {uiCopy("Needed by")} {query.data.neededBy}
        </Text>
      ) : null}
      {query.data.quoteRequestNote ? (
        <Text style={styles.requestNote}>{query.data.quoteRequestNote}</Text>
      ) : null}
      <SectionHeader>{uiCopy("Requested items")}</SectionHeader>
      {query.data.items.map((item) => {
        const draft = drafts[item.id] ?? {
          available: true,
          price: "",
          quantity: String(item.quantity),
          note: "",
        };
        return (
          <Card key={item.id}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={type.title}>{item.productName}</Text>
                <Text style={styles.meta}>
                  {uiCopy("Requested:")} {item.quantity}{" "}
                  {item.unit ?? item.productUnit ?? uiCopy("unit(s)")}
                </Text>
              </View>
              <Switch
                value={draft.available}
                onValueChange={(available) =>
                  updateDraft(item.id, { available })
                }
                disabled={readOnly}
              />
            </View>
            {draft.available ? (
              <View style={styles.fields}>
                <TextInput
                  value={draft.price}
                  onChangeText={(price) => updateDraft(item.id, { price })}
                  placeholder={uiCopy("Unit price")}
                  keyboardType="decimal-pad"
                  editable={!readOnly}
                  style={styles.input}
                  placeholderTextColor={colors.textFaint}
                />
                <TextInput
                  value={draft.quantity}
                  onChangeText={(quantity) =>
                    updateDraft(item.id, { quantity })
                  }
                  placeholder={uiCopy("Quantity")}
                  keyboardType="decimal-pad"
                  editable={!readOnly}
                  style={styles.input}
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            ) : null}
            <TextInput
              value={draft.note}
              onChangeText={(value) => updateDraft(item.id, { note: value })}
              placeholder={uiCopy("Item note (optional)")}
              editable={!readOnly}
              style={styles.fullInput}
              placeholderTextColor={colors.textFaint}
            />
          </Card>
        );
      })}
      <SectionHeader>{uiCopy("Response note")}</SectionHeader>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={uiCopy("Delivery terms or general note")}
        editable={!readOnly}
        multiline
        style={[styles.fullInput, styles.notes]}
        placeholderTextColor={colors.textFaint}
      />
      {!readOnly ? (
        <Button
          label={uiCopy("Send quote")}
          icon="send-outline"
          onPress={() => void submit()}
          loading={submitResponse.isPending}
          disabled={submitResponse.isPending}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  meta: { ...type.label, marginTop: 4 },
  requestNote: {
    color: colors.text,
    backgroundColor: colors.infoBg,
    padding: 12,
    borderRadius: theme.radius.md,
    marginVertical: 10,
    lineHeight: 20,
  },
  fields: { flexDirection: "row", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  fullInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    marginTop: 10,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  notes: {
    minHeight: 90,
    paddingTop: 12,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  lockedBanner: {
    color: colors.danger,
    backgroundColor: colors.infoBg,
    padding: 12,
    borderRadius: theme.radius.md,
    marginBottom: 10,
    fontWeight: "700",
    lineHeight: 20,
  },
});
