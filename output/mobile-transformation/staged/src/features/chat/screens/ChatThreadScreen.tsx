import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { Sheet as DesignSheet } from "../../../components/ui/Sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FlashListRef } from "@shopify/flash-list";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useChatMessages,
  useMarkConversationRead,
  useSendChatMessage,
} from "../../../services/api/queries/chat";
import { useOrders } from "../../../services/api/queries/orders";
import {
  connectChatSocket,
  getChatSocket,
  joinConversation,
  leaveConversation,
} from "../../../services/chatSocket";
import { FlashList, LoadingState } from "../../../components/ui";
import {
  formatDay,
  formatMoney,
  formatOrderRef,
  formatShortDate,
} from "../../../utils/format";
import type { ChatMessage } from "../../../types/chat";
import type { ChatStackParamList } from "./ChatListScreen";
import { usePermissions } from "../../../hooks/usePermissions";
import { useToast } from "../../shared/ToastProvider";
import { useConversationDraft } from "../useConversationDraft";
import { colors, theme, type } from "../../../theme";
import {
  pickChatAttachments,
  uploadChatAttachment,
  type PickedAttachment,
} from "../../../services/attachmentUpload";

export function ChatThreadScreen() {
  useUiLocale();

  const { params } = useRoute<RouteProp<ChatStackParamList, "ChatThread">>();
  return (
    <ChatThreadContent
      conversationId={params.conversationId}
      title={params.title}
    />
  );
}

export function ChatThreadContent({
  conversationId,
  title,
}: {
  conversationId: string;
  title?: string;
}) {
  useUiLocale();

  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const [draft, setDraft] = useConversationDraft(conversationId);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<
    PickedAttachment[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const showToast = useToast();
  const { can } = usePermissions();
  const canAttachOrder = can("ORDERS_VIEW");

  const {
    data: messages,
    isLoading,
    isError,
  } = useChatMessages(conversationId);
  const { mutate: markRead } = useMarkConversationRead();
  const sendMessage = useSendChatMessage();
  const { data: ordersData } = useOrders({ limit: "10" }, canAttachOrder);
  const recentOrders = ordersData?.orders?.slice(0, 8) ?? [];

  const selectedOrder =
    recentOrders.find((o) => o.id === selectedOrderId) ?? null;

  const items = messages ?? [];

  // Realtime is additive; polling remains the fallback when a socket is unavailable.
  useEffect(() => {
    const socket = getChatSocket();
    const handleNewMessage = (payload?: { conversationId?: string }) => {
      if (payload?.conversationId && payload.conversationId !== conversationId)
        return;
      void queryClient.invalidateQueries({
        queryKey: ["chat", "messages", conversationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["chat", "conversations"],
      });
    };

    socket.on("new_message", handleNewMessage);
    joinConversation(conversationId);
    void connectChatSocket().catch(() => {});

    return () => {
      socket.off("new_message", handleNewMessage);
      leaveConversation(conversationId);
    };
  }, [conversationId, queryClient]);

  const latestMessageId = items[items.length - 1]?.id ?? "empty";
  useEffect(() => {
    if (isLoading || lastMarkedReadRef.current === latestMessageId) return;
    lastMarkedReadRef.current = latestMessageId;
    markRead(conversationId, {
      onError: () => {
        lastMarkedReadRef.current = null;
      },
    });
  }, [isLoading, latestMessageId, markRead, conversationId]);
  useEffect(() => {
    if (items.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [items.length]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (
      (!body && !selectedOrderId && !selectedAttachments.length) ||
      sendMessage.isPending ||
      uploading
    )
      return;
    const msgBody =
      body || (selectedOrderId ? "(Order reference)" : "(Attachment)");
    const orderId = selectedOrderId;
    try {
      setUploading(selectedAttachments.length > 0);
      const attachments = await Promise.all(
        selectedAttachments.map(uploadChatAttachment),
      );
      await sendMessage.mutateAsync({
        conversationId: conversationId,
        body: msgBody,
        orderId,
        attachments,
      });
      setDraft("");
      setSelectedOrderId(null);
      setSelectedAttachments([]);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Message could not be sent.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }, [
    draft,
    selectedOrderId,
    selectedAttachments,
    conversationId,
    sendMessage,
    showToast,
    uploading,
  ]);

  const attachFiles = useCallback(async () => {
    try {
      const files = await pickChatAttachments();
      setSelectedAttachments((current) => [...current, ...files].slice(0, 5));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not attach files.",
        "error",
      );
    }
  }, [showToast]);

  if (isLoading && items.length === 0)
    return <LoadingState message={uiCopy("Loading messages…")} />;
  if (isError)
    return (
      <View style={styles.errorWrap}>
        <Ionicons
          name="cloud-offline-outline"
          size={40}
          color={colors.textFaint}
        />
        <Text style={styles.errorTitle}>
          {uiCopy("Couldn't load messages")}
        </Text>
        <Text style={styles.errorMsg}>
          {uiCopy("Check your connection and try again.")}
        </Text>
      </View>
    );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={40}
              color={colors.textFaint}
            />
            <Text style={styles.emptyTitle}>
              {uiCopy("Start the conversation")}
            </Text>
            <Text style={styles.emptyMsg}>
              {uiCopy("Send a message to")} {title ?? uiCopy("this contact")}.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            showDate={shouldShowDate(item, items[index - 1])}
          />
        )}
      />

      {/* Order attachment preview chip */}
      {selectedOrder ? (
        <View style={styles.orderChip}>
          <Ionicons name="cart-outline" size={14} color={colors.brand} />
          <Text style={styles.orderChipText} numberOfLines={1}>
            {uiCopy("Order")} {formatOrderRef(selectedOrder.id)} ·{" "}
            {formatMoney(selectedOrder.total_amount, selectedOrder.currency)}
          </Text>
          <Pressable onPress={() => setSelectedOrderId(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {selectedAttachments.length ? (
        <View style={styles.fileTray}>
          {selectedAttachments.map((file, index) => (
            <Pressable
              key={`${file.uri}-${index}`}
              onPress={() =>
                setSelectedAttachments((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              <Text style={styles.fileChip}>📎 {file.name} ×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) },
        ]}
      >
        <Pressable
          onPress={() => void attachFiles()}
          style={({ pressed }) => [
            styles.toolBtn,
            pressed && styles.toolBtnPressed,
          ]}
          accessibilityLabel={uiCopy("Attach image or PDF")}
          disabled={sendMessage.isPending || uploading}
        >
          <Ionicons name="attach" size={23} color={colors.textMuted} />
        </Pressable>
        {/* Order tag button */}
        {canAttachOrder ? (
          <Pressable
            onPress={() => setShowOrderPicker(true)}
            style={({ pressed }) => [
              styles.toolBtn,
              pressed && styles.toolBtnPressed,
            ]}
            accessibilityLabel={uiCopy("Attach order")}
          >
            <Ionicons
              name={selectedOrderId ? "cart" : "cart-outline"}
              size={22}
              color={selectedOrderId ? colors.brand : colors.textMuted}
            />
          </Pressable>
        ) : null}

        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={uiCopy("Message…")}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={4000}
        />
        <Pressable
          accessibilityRole="button"
          onPress={send}
          disabled={
            (!draft.trim() &&
              !selectedOrderId &&
              !selectedAttachments.length) ||
            sendMessage.isPending ||
            uploading
          }
          style={({ pressed }) => [
            styles.sendBtn,
            ((!draft.trim() &&
              !selectedOrderId &&
              !selectedAttachments.length) ||
              sendMessage.isPending ||
              uploading) &&
              styles.sendBtnDisabled,
            pressed && (draft.trim() || selectedOrderId)
              ? styles.sendBtnPressed
              : null,
          ]}
        >
          <Ionicons name="send" size={20} color={colors.onBrand} />
        </Pressable>
      </View>

      {/* Order picker modal */}
      <DesignSheet
        visible={showOrderPicker}
        onClose={() => setShowOrderPicker(false)}
      >
        <View style={styles.orderSheetHandle} />
        <Text style={styles.orderSheetTitle}>{uiCopy("Attach an order")}</Text>
        {recentOrders.length === 0 ? (
          <Text style={styles.orderSheetEmpty}>
            {uiCopy("No recent orders found.")}
          </Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {recentOrders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={[
                  styles.orderRow,
                  order.id === selectedOrderId && styles.orderRowSelected,
                ]}
                onPress={() => {
                  setSelectedOrderId(
                    order.id === selectedOrderId ? null : order.id,
                  );
                  setShowOrderPicker(false);
                }}
              >
                <View style={styles.orderRowLeft}>
                  <Text style={styles.orderRowId}>
                    {formatOrderRef(order.id)}
                  </Text>
                  <Text style={styles.orderRowStatus}>{order.status}</Text>
                </View>
                <Text style={styles.orderRowAmount}>
                  {formatMoney(order.total_amount, order.currency)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </DesignSheet>
    </KeyboardAvoidingView>
  );
}

function shouldShowDate(current: ChatMessage, previous?: ChatMessage) {
  if (!current.created_at) return false;
  if (!previous?.created_at) return true;
  const cur = new Date(current.created_at).toDateString();
  const prev = new Date(previous.created_at).toDateString();
  return cur !== prev;
}

function MessageBubble({
  message,
  showDate,
}: {
  message: ChatMessage;
  showDate: boolean;
}) {
  useUiLocale();

  const own = message.is_own ?? false;
  const time = formatShortDate(message.created_at);
  const hasOrderRef =
    Boolean(message.order_id) || message.message_type === "ORDER_REFERENCE";

  return (
    <View style={styles.bubbleWrap}>
      {showDate ? (
        <Text style={styles.dateLabel}>
          {formatDay(message.created_at) || time}
        </Text>
      ) : null}
      <View style={[styles.bubbleRow, own && styles.bubbleRowOwn]}>
        <View
          style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}
        >
          {!own && message.sender_name ? (
            <Text style={styles.sender}>{message.sender_name}</Text>
          ) : null}
          {hasOrderRef ? (
            <View style={[styles.orderRef, own && styles.orderRefOwn]}>
              <Ionicons
                name="cart-outline"
                size={13}
                color={own ? colors.onBrandMuted : colors.brand}
              />
              <Text
                style={[styles.orderRefText, own && styles.orderRefTextOwn]}
              >
                {uiCopy("Order")} {formatOrderRef(message.order_id)}
              </Text>
            </View>
          ) : null}
          {message.body && message.body !== "(Order reference)" ? (
            <Text style={[styles.body, own && styles.bodyOwn]}>
              {message.body}
            </Text>
          ) : null}
          {message.attachments?.map((attachment) => (
            <Text
              key={attachment.fileUrl}
              style={[styles.fileMessage, own && styles.bodyOwn]}
            >
              📎 {attachment.fileName}
            </Text>
          ))}
          {time ? (
            <Text style={[styles.time, own && styles.timeOwn]}>{time}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.sm },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl,
    gap: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  emptyMsg: { color: colors.textMuted, textAlign: "center" },
  bubbleWrap: { marginBottom: theme.spacing.sm },
  dateLabel: {
    ...type.caption,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowOwn: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bubbleOwn: { backgroundColor: colors.brand, borderColor: colors.brand },
  bubbleOther: { backgroundColor: colors.surface },
  sender: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
    marginBottom: 4,
  },
  body: { ...type.body, color: colors.text },
  bodyOwn: { color: colors.onBrand },
  fileMessage: { ...type.caption, marginTop: 6, color: colors.brand },
  time: { ...type.caption, marginTop: 4, textAlign: "right" },
  timeOwn: { color: colors.onBrandMuted },
  orderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandLight,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  orderRefOwn: { backgroundColor: "rgba(255,255,255,0.2)" },
  orderRefText: { fontSize: 12, fontWeight: "600", color: colors.brand },
  orderRefTextOwn: { color: colors.onBrand },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: colors.background,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  errorMsg: {
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  orderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: theme.spacing.md,
    marginBottom: 4,
    backgroundColor: colors.brandLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  orderChipText: {
    flex: 1,
    fontSize: 13,
    color: colors.brand,
    fontWeight: "600",
  },
  fileTray: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  fileChip: {
    ...type.caption,
    color: colors.brand,
    backgroundColor: colors.brandLight,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolBtn: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  toolBtnPressed: { opacity: 0.6 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
  // Order picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  orderSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    maxHeight: "60%",
  },
  orderSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: theme.spacing.md,
  },
  orderSheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginBottom: theme.spacing.md,
  },
  orderSheetEmpty: {
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: theme.spacing.lg,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  orderRowSelected: {
    backgroundColor: colors.brandLight,
  },
  orderRowLeft: { gap: 2 },
  orderRowId: { fontSize: 14, fontWeight: "700", color: colors.text },
  orderRowStatus: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: "capitalize",
  },
  orderRowAmount: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
