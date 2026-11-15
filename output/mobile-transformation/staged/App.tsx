import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { initializeAppLocale, useAppLocale } from "./src/i18n";
import { AppProviders } from "./src/app/AppProviders";

export default function App() {
  const locale = useAppLocale();
  useEffect(() => {
    void initializeAppLocale();
  }, []);
  return (
    <GestureHandlerRootView
      style={{ flex: 1, direction: locale === "ar" ? "rtl" : "ltr" }}
    >
      <AppProviders />
    </GestureHandlerRootView>
  );
}
