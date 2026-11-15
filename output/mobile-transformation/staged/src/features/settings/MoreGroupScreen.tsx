import { useAppLocale as useUiLocale } from "../../i18n";
import { copy } from "../../i18n";
import { Linking, StyleSheet } from "react-native";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import { Group, ListRow, Screen } from "../../components/ui";
import { webAppUrl } from "../../utils/webAppUrl";
import { theme } from "../../theme";
import type { MoreDest } from "./moreDest";

export type MoreGroupParams = {
  title: string;
  items: MoreDest[];
};

export function MoreGroupScreen() {
  useUiLocale();

  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, MoreGroupParams>, string>>();
  const title = route.params?.title ?? "More";
  const items = route.params?.items ?? [];

  const open = (item: MoreDest) => {
    if (item.webPath) {
      void Linking.openURL(webAppUrl(item.webPath));
      return;
    }
    if (item.tab) {
      navigation.navigate("Tabs", { screen: item.tab });
      return;
    }
    if (item.screen) navigation.navigate(item.screen);
  };

  return (
    <Screen title={title} scroll padded={false}>
      <Group style={styles.group}>
        {items.map((item) => (
          <ListRow
            key={`${item.title}-${item.screen ?? item.tab ?? item.webPath}`}
            icon={item.icon}
            title={copy(item.title)}
            compact
            onPress={() => open(item)}
          />
        ))}
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: theme.spacing.sm },
});
