// Apo — навигатор экранов.
// Экспорт по контракту: ApoNavigator из src/screens/apo/index.ts.
// NATIVE OWNER (Ares): встроить ApoNavigator в корневой App.tsx scaffold
// (import { ApoNavigator } ...). App.tsx НЕ трогаю — он за scaffold.
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ApoThemeProvider } from './apoTheme';
import ApoHomeScreen from './ApoHomeScreen';
import ApoCaptureScreen from './ApoCaptureScreen';
import ApoConvertScreen from './ApoConvertScreen';
import ApoSolvingScreen from './ApoSolvingScreen';
import ApoResultScreen from './ApoResultScreen';
import ApoPaywallScreen from './ApoPaywallScreen';

const Stack = createNativeStackNavigator();

export function ApoNavigator() {
  return (
    <ApoThemeProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="ApoHome" component={ApoHomeScreen} />
        <Stack.Screen name="ApoCapture" component={ApoCaptureScreen} />
        <Stack.Screen name="ApoConvert" component={ApoConvertScreen} />
        <Stack.Screen name="ApoSolving" component={ApoSolvingScreen} />
        <Stack.Screen name="ApoResult" component={ApoResultScreen} />
        <Stack.Screen name="Paywall" component={ApoPaywallScreen} />
      </Stack.Navigator>
    </ApoThemeProvider>
  );
}

export { ApoHomeScreen, ApoCaptureScreen, ApoConvertScreen, ApoSolvingScreen, ApoResultScreen, ApoPaywallScreen };
