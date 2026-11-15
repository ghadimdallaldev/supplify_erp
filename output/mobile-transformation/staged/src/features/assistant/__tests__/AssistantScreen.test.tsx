import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AssistantScreen } from "../screens/AssistantScreen";

const mockSend = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "SUPPLIER", workspace: { tenantId: "s1" } },
  }),
}));
jest.mock("../../../components/ui", () => {
  const { View, Text } = jest.requireActual("react-native");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    LoadingState: () => <Text>Loading</Text>,
    EmptyState: () => <Text>Empty</Text>,
  };
});
jest.mock("../../../services/api/queries/assistant", () => ({
  useAssistantCapabilities: () => ({
    data: {
      enabled: true,
      tools: ["get_supplier_overview", "get_fulfillment_board"],
      quotaRemaining: 10,
    },
  }),
  useAssistantConversations: () => ({ data: { conversations: [] } }),
  useAssistantMessages: () => ({ data: undefined }),
  useSendAssistantMessage: () => ({ isPending: false, mutateAsync: mockSend }),
}));
jest.mock("../../../services/attachmentUpload", () => ({
  pickChatAttachments: jest.fn(async () => []),
  uploadChatAttachment: jest.fn(),
}));
jest.mock("../i18n", () => ({ assistantText: (key: string) => key }));
jest.mock("../../../i18n", () => ({
  ...jest.requireActual("../../../i18n"),
  isRtl: () => false,
}));

describe("read-only mobile assistant", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });
  it("offers supplier-specific starter questions", () => {
    const screen = render(<AssistantScreen />);
    expect(screen.getByText("suggestions.fulfillment")).toBeTruthy();
    expect(screen.queryByText("suggestions.stock")).toBeNull();
  });
  it("shows the returned answer and source instead of claiming an action occurred", async () => {
    mockSend.mockResolvedValue({
      conversationId: "c1",
      reply: "Three orders need preparation",
      sources: [
        {
          tool: "get_supplier_overview",
          ok: true,
          evidence: { fetchedAt: "2026-11-14T10:00:00Z", limited: false },
        },
      ],
    });
    const screen = render(<AssistantScreen />);
    fireEvent.changeText(
      screen.getByLabelText("placeholder"),
      "What needs attention?",
    );
    fireEvent.press(screen.getByLabelText("send"));
    await waitFor(() =>
      expect(screen.getByText("Three orders need preparation")).toBeTruthy(),
    );
    expect(mockSend).toHaveBeenCalledWith({
      conversationId: null,
      message: "What needs attention?",
      attachments: [],
    });
    expect(screen.getByText(/sources.get_supplier_overview/)).toBeTruthy();
  });
});
