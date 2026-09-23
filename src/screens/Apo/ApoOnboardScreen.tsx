import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { APO_ONBOARD_KEY } from './ApoBootScreen';

interface Props {
  navigation: any;
}

const PAGES = [
  { icon: 'scan', title: 'Сними тест', sub: 'Фото, скриншот, PDF или Word — разберём сами' },
  { icon: 'flash', title: 'Ответ за секунды', sub: 'Точность ниже 75% — честно предупредим' },
  { icon: 'document-text', title: 'Разбор по кнопке', sub: '«Объяснить подробнее» под каждым ответом' },
];

export default function ApoOnboardScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const [page, setPage] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  const goPage = (p: number) => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    setPage(p);
  };

  useEffect(() => {
    // Мягкая смена текста после старта fade-out.
    const t = setTimeout(() => {}, 0);
    return () => clearTimeout(t);
  }, [page]);

  const finish = async () => {
    try {
      await AsyncStorage.setItem(APO_ONBOARD_KEY, '1');
    } catch { /* onboarding must not block */ }
    navigation.replace('ApoHome');
  };

  const cur = PAGES[page];

  return (
    <View style={s.root}>
      <Animated.View style={[s.center, { opacity: fade }]}>
        <View style={s.badge}>
          <Ionicons name={cur.icon as any} size={44} color="#FFF" />
        </View>
        <Text style={s.title}>{cur.title}</Text>
        <Text style={s.sub}>{cur.sub}</Text>
      </Animated.View>

      <View style={s.dots}>
        {PAGES.map((_, i) => (
          <Pressable key={i} onPress={() => goPage(i)} hitSlop={8}>
            <View style={[s.dot, i === page && s.dotOn]} />
          </Pressable>
        ))}
      </View>

      <View style={s.footer}>
        {page < PAGES.length - 1 ? (
          <>
            <Pressable style={s.next} onPress={() => goPage(page + 1)}>
              <Text style={s.nextText}>Дальше</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </Pressable>
            <Pressable onPress={finish}>
              <Text style={s.skip}>Пропустить</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={s.next} onPress={finish}>
            <Text style={s.nextText}>Начать</Text>
            <Ionicons name="checkmark" size={18} color="#FFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0B0F17', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    badge: {
      width: 110, height: 110, borderRadius: 32, backgroundColor: '#2B4BD8',
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    title: { fontSize: 24, fontWeight: '800', color: '#F2F5F9', textAlign: 'center' },
    sub: { fontSize: 14, color: '#8A94A6', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#232D40' },
    dotOn: { backgroundColor: '#4F7CFF', width: 24 },
    footer: { gap: 12 },
    next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 16, backgroundColor: '#4F7CFF' },
    nextText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
    skip: { textAlign: 'center', fontSize: 14, color: '#8A94A6' },
  });
}
