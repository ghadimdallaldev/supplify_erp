import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AdminHomeScreen } from '../screens/AdminHomeScreen'

const Stack = createNativeStackNavigator()

export function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
    </Stack.Navigator>
  )
}
