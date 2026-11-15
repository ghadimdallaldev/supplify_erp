import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import {
  useAssistantCapabilities,
  useAssistantConversations,
  useAssistantMessages,
  useSendAssistantMessage,
} from "../../../services/api/queries/assistant";
import { EmptyState, LoadingState, Screen } from "../../../components/ui";
import { colors } from "../../../theme";
import { useAuth } from "../../auth/AuthContext";
import { isRtl } from "../../../i18n";
import type {
  AssistantAttachment,
  AssistantSource,
} from "../../../types/assistant";
import {
  pickChatAttachments,
  uploadChatAttachment,
  type PickedAttachment,
} from "../../../services/attachmentUpload";
import { assistantText as t } from "../i18n";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AssistantSource[];
  attachments?: AssistantAttachment[];
};

export function AssistantScreen() {
  const { user } = useAuth();
  return (
    <AssistantConversation key={`${user?.id}:${user?.workspace?.tenantId}`} />
  );
}

function AssistantConversation() {
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const caps = useAssistantCapabilities();
  const send = useSendAssistantMessage();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [before, setBefore] = useState<string>();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const history = useAssistantConversations(
    offset,
    historyOpen && Boolean(caps.data?.enabled),
  );
  const saved = useAssistantMessages(conversationId, before);
  const mounted = useRef(true);
  const list = useRef<FlatList<Msg>>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!saved.data) return;
    const page = saved.data.messages
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        id: m.id,
        role: m.role as Msg["role"],
        content: m.content,
        sources: m.toolPayload?.sources,
        attachments: m.toolPayload?.attachments,
      }));
    setMessages((current) =>
      before
        ? [...page, ...current].filter(
            (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
          )
        : page,
    );
  }, [saved.data, before]);
  const busy = send.isPending || uploading;
  const enabled = Boolean(caps.data?.enabled);
  const supplier = user?.role === "SUPPLIER";
  const candidates = supplier
    ? [
        ["fulfillment", "get_fulfillment_board"],
        ["warehouse", "get_warehouse_stock"],
        ["orders", "get_orders"],
        ["invoices", "get_invoices"],
      ]
    : [
        ["stock", "get_inventory"],
        ["need", "get_reorder_need"],
        ["bestPrices", "compare_supplier_prices"],
        ["orders", "get_orders"],
        ["reservations", "get_reservations"],
      ];
  const suggestionKeys = [
    "attention",
    ...candidates
      .filter(([, tool]) => caps.data?.tools.includes(tool))
      .map(([key]) => key),
  ];

  function reset(id: string | null = null) {
    setConversationId(id);
    setMessages([]);
    setBefore(undefined);
    setDraft("");
    setFiles([]);
    setError("");
    setHistoryOpen(false);
  }
  function openSource(source: AssistantSource) {
    const href = source.evidence?.href;
    if (href === "/app/orders")
      navigation.navigate("Tabs", { screen: "Orders" });
    else if (href === "/app/dashboard" || href === "/app")
      navigation.navigate("Tabs", { screen: supplier ? "Dashboard" : "Home" });
    else if (
      href === "/app/suppliers" ||
      (href === "/app/products" && !supplier)
    )
      navigation.navigate("Tabs", { screen: "Shop" });
    else if (href === "/app/products" && supplier)
      navigation.navigate("SupplierProducts");
    else if (href === "/app/fulfillment" && supplier)
      navigation.navigate("Tabs", { screen: "Fulfillment" });
    else {
      const routes: Record<string, string> = {
        "/app/invoices": supplier ? "Receivables" : "Invoices",
        "/app/restaurant-inventory": "Inventory",
        "/app/reservations": "Reservations",
        "/app/inventory": "SupplierInventory",
        "/app/reports": "Reports",
      };
      if (href && routes[href]) navigation.navigate(routes[href]);
    }
  }
  async function onSend(text: string) {
    const message = text.trim() || (files.length ? t("reviewAttachments") : "");
    if (!message || busy || !enabled || caps.data?.quotaRemaining === 0) return;
    try {
      setError("");
      setUploading(files.length > 0);
      const attachments = await Promise.all(files.map(uploadChatAttachment));
      if (!mounted.current) return;
      const optimistic: Msg[] = [
        ...messages,
        { id: `u-${Date.now()}`, role: "user", content: message, attachments },
      ];
      setMessages(optimistic);
      setDraft("");
      setFiles([]);
      const response = await send.mutateAsync({
        conversationId,
        message,
        attachments,
      });
      if (!mounted.current) return;
      setConversationId(response.conversationId);
      setBefore(undefined);
      setMessages([
        ...optimistic,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: response.reply,
          sources: response.sources,
        },
      ]);
      requestAnimationFrame(() =>
        list.current?.scrollToEnd({ animated: false }),
      );
    } catch {
      if (mounted.current) {
        setError(t("error"));
        setDraft(text);
      }
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  async function attach() {
    try {
      const picked = await pickChatAttachments();
      if (!mounted.current) return;
      if (files.length + picked.length > 5) setError(t("fileLimits"));
      setFiles((current) => [...current, ...picked].slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    }
  }
  if (caps.isLoading) return <LoadingState message={t("thinking")} />;
  if (!enabled)
    return (
      <Screen title={t("title")}>
        <EmptyState
          title={t("unavailable")}
          message={caps.isError ? t("error") : t("unavailable")}
        />
      </Screen>
    );
  return (
    <Screen title={t("title")} padded={false} scroll={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={88}
      >
        <View style={styles.toolbar}>
          <Text style={styles.caption}>
            {caps.data?.quotaRemaining != null
              ? t("quotaHint", { remaining: caps.data.quotaRemaining })
              : t("subtitle")}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setHistoryOpen(!historyOpen)}
            style={styles.control}
          >
            <Text style={styles.link}>{t("history")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => reset()}
            style={styles.control}
          >
            <Text style={styles.link}>{t("newChat")}</Text>
          </Pressable>
        </View>
        {historyOpen && (
          <View style={styles.history}>
            {history.isFetching ? (
              <ActivityIndicator />
            ) : (
              history.data?.conversations.slice(0, 20).map((c) => (
                <Pressable
                  accessibilityRole="button"
                  key={c.id}
                  onPress={() => reset(c.id)}
                  style={styles.control}
                >
                  <Text numberOfLines={1} style={styles.text}>
                    {c.title || t("newChat")}
                  </Text>
                </Pressable>
              ))
            )}
            {!history.isFetching && !history.data?.conversations.length && (
              <Text>{history.isError ? t("error") : t("noHistory")}</Text>
            )}
            <View style={styles.toolbar}>
              <Pressable
                disabled={offset === 0}
                style={styles.control}
                onPress={() => setOffset(Math.max(0, offset - 20))}
              >
                <Text>{t("previous")}</Text>
              </Pressable>
              <Pressable
                style={styles.control}
                disabled={(history.data?.conversations.length || 0) < 20}
                onPress={() => setOffset(offset + 20)}
              >
                <Text>{t("next")}</Text>
              </Pressable>
            </View>
          </View>
        )}
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            saved.data?.hasMore ? (
              <Pressable
                style={styles.control}
                disabled={saved.isFetching}
                onPress={() => setBefore(saved.data?.nextBefore || undefined)}
              >
                <Text style={styles.link}>{t("older")}</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View>
              <Text style={styles.text}>
                {saved.isFetching
                  ? t("thinking")
                  : saved.isError
                    ? t("error")
                    : t("empty")}
              </Text>
              {!conversationId &&
                suggestionKeys.map((key) => (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    key={key}
                    onPress={() => void onSend(t(`suggestions.${key}`))}
                    style={styles.chip}
                  >
                    <Text style={styles.text}>{t(`suggestions.${key}`)}</Text>
                  </Pressable>
                ))}
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[styles.bubble, item.role === "user" && styles.userBubble]}
            >
              <Text
                selectable
                style={[
                  styles.text,
                  isRtl() && styles.rtl,
                  item.role === "user" && styles.userText,
                ]}
              >
                {item.content}
              </Text>
              {item.attachments?.map((file) => (
                <Pressable
                  key={file.fileUrl}
                  onPress={() => {
                    if (/^https?:\/\//.test(file.fileUrl))
                      void Linking.openURL(file.fileUrl).catch(() =>
                        setError(t("error")),
                      );
                  }}
                  style={styles.control}
                >
                  <Text
                    style={item.role === "user" ? styles.userText : styles.link}
                  >
                    {file.fileName}
                  </Text>
                </Pressable>
              ))}
              {item.role === "assistant" && (
                <>
                  {item.sources
                    ?.filter(
                      (source, i, all) =>
                        all.findIndex((s) => s.tool === source.tool) === i,
                    )
                    .map((source) => (
                      <Pressable
                        key={source.tool}
                        accessibilityRole="button"
                        disabled={!source.ok || !source.evidence?.href}
                        onPress={() => openSource(source)}
                        style={styles.source}
                      >
                        <Text style={styles.caption}>
                          {t(`sources.${source.tool}`)} ·{" "}
                          {t(
                            source.ok ? "sourceVerified" : "sourceUnavailable",
                          )}
                          {source.evidence?.fetchedAt
                            ? ` · ${new Date(source.evidence.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </Text>
                        {source.evidence?.limited && (
                          <Text style={styles.caption}>
                            {t("limitedResults")}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  <Pressable
                    accessibilityRole="button"
                    style={styles.control}
                    onPress={() => {
                      void Share.share({ message: item.content }).catch(() =>
                        setError(t("error")),
                      );
                    }}
                  >
                    <Text style={styles.link}>{t("shareAnswer")}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
          ListFooterComponent={
            busy ? (
              <View accessibilityLiveRegion="polite" style={styles.toolbar}>
                <ActivityIndicator color={colors.brand} />
                <Text>{t("thinking")}</Text>
              </View>
            ) : null
          }
        />
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {caps.data?.quotaRemaining === 0 && (
          <Text style={styles.caption}>{t("quotaExhausted")}</Text>
        )}
        <View style={styles.attachments}>
          {files.map((file, i) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("removeFile", { name: file.name })}
              key={`${file.uri}-${i}`}
              onPress={() => setFiles(files.filter((_, index) => i !== index))}
            >
              <Text style={styles.link}>{file.name} ×</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("attachFiles")}
            disabled={busy}
            style={styles.control}
            onPress={() => void attach()}
          >
            <Text style={styles.link}>＋</Text>
          </Pressable>
          <TextInput
            accessibilityLabel={t("placeholder")}
            style={[styles.input, isRtl() && styles.rtl]}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={4000}
            placeholder={t("placeholder")}
            editable={!busy}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("send")}
            disabled={
              busy ||
              (!draft.trim() && !files.length) ||
              caps.data?.quotaRemaining === 0
            }
            onPress={() => void onSend(draft)}
            style={[
              styles.send,
              (busy || caps.data?.quotaRemaining === 0) && styles.disabled,
            ]}
          >
            <Text style={styles.userText}>{t("send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    flexWrap: "wrap",
  },
  caption: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
  control: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { color: colors.brand, fontWeight: "600", fontSize: 13 },
  text: { color: colors.text, fontSize: 14, lineHeight: 22 },
  rtl: { textAlign: "right", writingDirection: "rtl" },
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  bubble: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  userBubble: {
    backgroundColor: colors.brand,
    alignSelf: "flex-end",
    maxWidth: "92%",
  },
  userText: { color: "#fff", fontSize: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  source: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    minHeight: 40,
  },
  history: {
    maxHeight: 240,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  attachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
  },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    color: colors.text,
  },
  send: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, padding: 12 },
});
