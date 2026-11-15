import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Text, TextInput } from "../primitives";
import { V2QuantityControl } from "../v2";
import { copy, setAppLocale, useAppLocale } from "../../../i18n";
import { localDateKey, parseDateKey } from "../DateField";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

afterEach(() => {
  act(() => setAppLocale("en"));
});

it("keeps calendar dates local and rejects rollover dates", () => {
  expect(localDateKey(new Date(2026, 10, 15, 0, 5))).toBe("2026-11-15");
  expect(parseDateKey("2028-02-29")).not.toBeNull();
  expect(parseDateKey("2026-02-29")).toBeNull();
  expect(parseDateKey("2026-13-01")).toBeNull();
});

it("normalizes numeric Arabic input without altering guest names or notes", () => {
  const numeric = jest.fn(),
    name = jest.fn();
  const screen = render(
    <>
      <TextInput
        accessibilityLabel="Amount"
        keyboardType="decimal-pad"
        onChangeText={numeric}
      />
      <TextInput accessibilityLabel="Guest" onChangeText={name} />
    </>,
  );
  fireEvent.changeText(screen.getByLabelText("Amount"), "١٢٫٥");
  fireEvent.changeText(screen.getByLabelText("Guest"), "ليلى ١٢");
  expect(numeric).toHaveBeenCalledWith("12.5");
  expect(name).toHaveBeenCalledWith("ليلى ١٢");
});

it("changes mounted copy without remounting or losing a form draft", () => {
  function Example() {
    useAppLocale();
    const [value, setValue] = React.useState("");
    return (
      <>
        <Text>{copy("Orders")}</Text>
        <TextInput
          accessibilityLabel="Draft"
          value={value}
          onChangeText={setValue}
        />
      </>
    );
  }
  const screen = render(<Example />);
  fireEvent.changeText(screen.getByLabelText("Draft"), "Keep this note");
  act(() => setAppLocale("ar"));
  expect(screen.getByText("الطلبات")).toBeTruthy();
  expect(screen.getByLabelText("Draft").props.value).toBe("Keep this note");
});

it("allows replacing a quantity before committing the edit", () => {
  const change = jest.fn();
  const screen = render(
    <V2QuantityControl
      quantity={2}
      onChangeQuantity={change}
      onIncrement={jest.fn()}
      onDecrement={jest.fn()}
    />,
  );
  const input = screen.getByLabelText("Quantity");
  fireEvent.changeText(input, "");
  fireEvent.changeText(input, "12.5");
  expect(change).not.toHaveBeenCalled();
  fireEvent(input, "endEditing");
  expect(change).toHaveBeenCalledWith(12.5);
});
