import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { cores } from '../design-system/tokens'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: cores.papel },
          headerTintColor: cores.tinta,
          contentStyle: { backgroundColor: cores.papel },
        }}
      />
    </>
  )
}
