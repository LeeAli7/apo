// Apo — навигатор экранов + Drawer-оверлей слева (замена таб-бара).
// Экспорт по контракту: ApoNavigator из src/screens/Apo/index.tsx.
// NATIVE OWNER (Ares): App.tsx за scaffold — сюда не лезть; шестерёнка
// на экранах открывает Drawer через useApoUI().
import React from 'react';
import { View, Pressable, StyleSheet, Dimensions } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ApoThemeProvider } from './apoTheme';
import { ApoUIProvider, useApoUI } from './apoUI';
import ApoHomeScreen from './ApoHomeScreen';
import ApoCaptureScreen from './ApoCaptureScreen';
import ApoConvertScreen from './ApoConvertScreen';
import ApoSolvingScreen from './ApoSolvingScreen';
import ApoResultScreen from './ApoResultScreen';
import ApoPaywallScreen from './ApoPaywallScreen';
import ApoHistoryScreen from './ApoHistoryScreen';
import ApoDrawerScreen from './ApoDrawerScreen';

const Stack = createNativeStackNavigator();
const DRAWER_W = Math.min(320, Dimensions.get('window').width * 0.85);

function Shell() {
  const { drawerOpen, closeDrawer } = useApoUI();
  const navigation = useNavigation() as any;
  return (
    <View style={s.root}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="ApoHome" component={ApoHomeScreen} />
        <Stack.Screen name="ApoCapture" component={ApoCaptureScreen} />
        <Stack.Screen name="ApoConvert" component={ApoConvertScreen} />
        <Stack.Screen name="ApoSolving" component={ApoSolvingScreen} />
        <Stack.Screen name="ApoResult" component={ApoResultScreen} />
        <Stack.Screen name="ApoHistory" component={ApoHistoryScreen} />
        <Stack.Screen name="Paywall" component={ApoPaywallScreen} />
      </Stack.Navigator>
      {drawerOpen && (
        <View style={s.overlay}>
          <Pressable style={s.scrim} onPress={closeDrawer} />
          <View style={s.drawer}>
            <ApoDrawerScreen navigation={navigation} />
          </View>
        </View>
      )}
    </View>
  );
}

export function ApoNavigator() {
  return (
    <ApoThemeProvider>
      <ApoUIProvider>
        <Shell />
      </ApoUIProvider>
    </ApoThemeProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', zIndex: 50 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)' },
  drawer: { width: DRAWER_W, backgroundColor: '#0D121C' },
});

export { ApoHomeScreen, ApoCaptureScreen, ApoConvertScreen, ApoSolvingScreen, ApoResultScreen, ApoPaywallScreen, ApoHistoryScreen, ApoDrawerScreen };
