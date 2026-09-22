// Apo — scaffold placeholder. Integrator swaps this root for Keyz's
// ApoNavigator (src/screens/apo) at merge; screens are Keyz's slice,
// this file is the engine owner's only UI surface.
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Apo</Text>
      <Text style={styles.sub}>Test solver — engine scaffold online</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logo: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '800',
  },
  sub: {
    color: '#8a8a8a',
    fontSize: 14,
  },
});
