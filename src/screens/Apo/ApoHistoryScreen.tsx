import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';
import { readHistory, type HistoryEntry } from '../../core/apo';

interface Props {
  navigation: any;
}

export default function ApoHistoryScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => setHistory(await readHistory()))();
    }, []),
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.topbar}>
        <Pressable style={s.back} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color="#8A94A6" />
          <Text style={s.backText}>Назад</Text>
        </Pressable>
        <Pressable style={s.iconBtn} onPress={openDrawer}>
          <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={s.title}>История</Text>
      {history.length === 0 && <Text style={s.ghost}>Пока пусто — решите первый тест</Text>}
      {history.map((h, i) => (
        <View key={i} style={s.card}>
          <Text style={s.q} numberOfLines={3}>{h.stem}</Text>
          <Text style={s.ansSmall}>
            {h.choice} · {Math.round(h.confidence * 100)}%{h.lowAccuracy ? ' · проверь' : ''}
          </Text>
        </View>
      ))}
      <Pressable style={s.cta} onPress={() => navigation.navigate('ApoHome')}>
        <Text style={s.ctaText}>Новый тест</Text>
      </Pressable>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17' },
    content: { padding: 18, paddingTop: insets.top + 12, paddingBottom: 40 },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backText: { color: '#8A94A6', fontSize: 13, fontWeight: '600' },
    iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 21, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    card: { backgroundColor: '#131A26', borderRadius: 16, padding: 14, marginTop: 10 },
    q: { fontSize: 15, fontWeight: '700', color: '#F2F5F9', lineHeight: 21 },
    ansSmall: { fontSize: 13, color: '#8A94A6', marginTop: 4 },
    ghost: { fontSize: 13, color: '#5B6678', marginTop: 12 },
    cta: { borderRadius: 16, padding: 15, marginTop: 14, backgroundColor: '#4F7CFF', alignItems: 'center' },
    ctaText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
  });
}
