import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ReservationBoard } from "../screens/reservations/ReservationBoard";

const mockUpdate = jest.fn().mockResolvedValue({});
let mockCanEdit = false;
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true, canAny: () => mockCanEdit }),
}));
jest.mock("../../../theme/responsive", () => ({
  useAdaptiveLayout: () => ({ wide: false, expanded: false, width: 390 }),
}));
jest.mock("../../../components/ui/DateField", () => ({
  DateField: () => null,
  localDateKey: () => "2026-11-15",
  parseDateKey: () => new Date(),
}));
jest.mock("../../../components/layout/SplitView", () => ({
  SplitView: ({ master }: { master: React.ReactNode }) => master,
}));
jest.mock("../../../components/ui", () => {
  const { View, Text, Pressable } = jest.requireActual("react-native");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Sheet: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) => (visible ? <View>{children}</View> : null),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    ListRow: ({
      title,
      onPress,
      right,
    }: {
      title: string;
      onPress?: () => void;
      right?: React.ReactNode;
    }) => (
      <View>
        <Pressable onPress={onPress}>
          <Text>{title}</Text>
        </Pressable>
        {right}
      </View>
    ),
    FlashList: ({
      data,
      renderItem,
    }: {
      data: unknown[];
      renderItem: (args: { item: unknown }) => React.ReactNode;
    }) => (
      <View>
        {data.map((item, index) => (
          <View key={index}>{renderItem({ item })}</View>
        ))}
      </View>
    ),
    SectionHeader: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    EmptyState: () => null,
    ErrorState: () => null,
    StatusPill: () => null,
    FilterBar: () => null,
  };
});
jest.mock("../../../services/api/queries", () => ({
  useReservationBoard: () => ({
    data: {
      tables: [{ id: "t1", name: "Window", capacity: 4, is_active: true }],
      reservations: [
        {
          id: "b1",
          customer_name: "Maya",
          party_size: 3,
          scheduled_at: "2026-11-15T18:00:00Z",
          tables: ["t1"],
          status: "CONFIRMED",
        },
      ],
      waitlist: [],
    },
  }),
  useUpdateReservationStatus: () => ({ mutateAsync: mockUpdate }),
  useAssignReservationTables: () => ({ mutateAsync: jest.fn() }),
  usePromoteWaitlist: () => ({ mutateAsync: jest.fn() }),
}));

beforeEach(() => {
  mockCanEdit = false;
  mockUpdate.mockClear();
});
it("allows viewing a booking without exposing mutation controls to a viewer", () => {
  const screen = render(<ReservationBoard />);
  fireEvent.press(screen.getByText("Maya"));
  expect(screen.queryByText("Seat guest")).toBeNull();
  expect(screen.queryByText("Save table assignment")).toBeNull();
  expect(mockUpdate).not.toHaveBeenCalled();
});
it("submits the existing status contract only after an authorized action", async () => {
  mockCanEdit = true;
  const screen = render(<ReservationBoard />);
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Maya"));
  fireEvent.press(screen.getByText("Seat guest"));
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith({ id: "b1", status: "SEATED" }),
  );
});
