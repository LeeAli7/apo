import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export const APO_ONBOARD_KEY = 'apo_onboard_v1';

interface Props {
  navigation: any;
}

export default function ApoBootScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    let alive = true;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
    (async () => {
      await new Promise((r) => setTimeout(r, 950));
      if (!alive) return;
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(APO_ONBOARD_KEY)) === '1';
      } catch { /* first launch on error */ }
      navigation.replace(seen ? 'ApoHome' : 'ApoOnboard');
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Animated.View style={[s.center, { opacity: fade, transform: [{ scale }] }]}>
        <View style={s.badge}>
          <Ionicons name="checkmark" size={64} color="#2B4BD8" />
        </View>
        <Text style={s.logo}>Apo</Text>
        <Text style={s.tag}>Тесты — за секунды</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2B4BD8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  badge: {
    width: 120, height: 120, borderRadius: 30, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { fontSize: 34, fontWeight: '800', color: '#FFF' },
  tag: { fontSize: 14, color: '#D5DCE8' },
});
