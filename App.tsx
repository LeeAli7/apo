import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { ApoNavigator } from './src/screens/Apo';

export default function App() {
  return (
    <NavigationContainer>
      <ApoNavigator />
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
