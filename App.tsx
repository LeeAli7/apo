import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApoNavigator } from './src/screens/Apo';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <ApoNavigator />
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
