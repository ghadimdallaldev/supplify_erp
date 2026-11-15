import { useAppLocale as useUiLocale } from "../i18n";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AdminHomeScreen } from "../screens/AdminHomeScreen";

const Stack = createNativeStackNavigator();

export function AdminNavigator() {
  useUiLocale();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
    </Stack.Navigator>
  );
}
