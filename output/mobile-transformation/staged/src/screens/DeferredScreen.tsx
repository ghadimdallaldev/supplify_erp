import { copy as uiCopy, useAppLocale as useUiLocale } from "../i18n";
import { View, StyleSheet } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { Screen, EmptyState, Button } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { theme } from "../theme";

type Params = { feature?: string; reason?: string };

export function DeferredScreen() {
  useUiLocale();

  const route = useRoute<RouteProp<Record<string, Params>, string>>();
  const feature = route.params?.feature ?? "This feature";
  const reason = route.params?.reason ?? "Available on the web app for now.";
  const { logout } = useAuth();

  return (
    <Screen title={uiCopy("Supplify")}>
      <View style={styles.body}>
        <EmptyState
          icon="desktop-outline"
          title={uiCopy("{{v0}} — web only", { v0: feature })}
          message={reason}
        />
      </View>
      <View style={styles.footer}>
        <Button
          label={uiCopy("Sign out")}
          variant="danger"
          icon="log-out-outline"
          onPress={() => void logout()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: "center" },
  footer: { paddingVertical: theme.spacing.md },
});
