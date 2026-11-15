import React from "react";
import { render } from "@testing-library/react-native";
import { ReorderGuidance } from "../components/ReorderGuidance";

const mockSuggestion = {
  id: "s1",
  productId: "p1",
  supplierId: "supplier",
  productName: "Tomatoes",
  productUnit: "kg",
  suggestedQty: 0,
  currentQty: 10,
  incomingQty: 20,
  expectedUsage: 20,
  netNeed: 0,
  action: "wait",
  dataQuality: "good",
  reasonLabel: "Covered by incoming stock",
  warnings: [],
};
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("../../../hooks/useEntitlements", () => ({
  useFeatureEnabled: (key: string) => key === "smart_reorder",
}));
jest.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));
jest.mock("../../../services/api/queries/reorder", () => ({
  useReorderGuidance: () => ({
    data: { suggestions: [mockSuggestion] },
    refetch: jest.fn(),
  }),
}));
jest.mock("../../../services/api/queries/quickLists", () => ({
  useQuickLists: () => ({ data: [] }),
}));
jest.mock("../../../services/api/client", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../../store/cartStore", () => ({
  useCartStore: {
    getState: () => ({ checkoutAttempt: null, addItem: jest.fn() }),
  },
}));
jest.mock("../../../components/ui", () => {
  const { View } = jest.requireActual("react-native");
  return {
    Card: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});
jest.mock("../../assistant/i18n", () => ({
  assistantText: (key: string) => key,
}));

describe("mobile reorder guidance", () => {
  it("shows the shared net requirement and no purchase button for a wait decision", () => {
    const screen = render(<ReorderGuidance />);
    expect(screen.getByText("Tomatoes")).toBeTruthy();
    expect(screen.getByText("guidance.netNeed")).toBeTruthy();
    expect(screen.queryByText("addCart")).toBeNull();
    expect(screen.queryByText("addList")).toBeNull();
    expect(screen.getByText("viewCatalog")).toBeTruthy();
  });
});
