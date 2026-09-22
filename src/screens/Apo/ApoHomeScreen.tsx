import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';
import { quotaRemaining, APO_FREE_DAILY } from '../../core/apo';

interface Props {
  navigation: any;
}

const ROWS: { icon: string; title: string; sub: string; route: string; params: any }[] = [
  { icon: 'camera', title: 'Камера', sub: 'Снять вопрос прямо сейчас', route: 'ApoCapture', params: {} },
  { icon: 'image', title: 'Скриншот', sub: 'Выбрать из галереи', route: 'ApoCapture', params: { tab: 'gallery' } },
  { icon: 'document-text', title: 'Документ', sub: 'PDF, Word, изображение', route: 'ApoConvert', params: {} },
  { icon: 'text', title: 'Вставить текст', sub: 'Вопрос и варианты разложим сами', route: 'ApoConvert', params: { tab: 'text' } },
];

export default function ApoHomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const [left, setLeft] = useState(APO_FREE_DAILY);
  const s = styles(theme, insets);

  useFocusEffect(
    useCallback(() => {
      (async () => setLeft(await quotaRemaining()))();
    }, []),
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.topbar}>
        <Text style={s.logo}>Apo</Text>
        <View style={s.topRight}>
          <Pressable style={s.proBadge} onPress={() => navigation.navigate('Paywall')}>
            <Text style={s.proText}>PRO</Text>
          </Pressable>
          <Pressable style={s.iconBtn} onPress={openDrawer}>
            <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <Text style={s.greet}>Что решаем сегодня?</Text>

      <Pressable style={s.hero} onPress={() => navigation.navigate('ApoCapture')}>
        <View style={s.heroTextWrap}>
          <Text style={s.heroTitle}>Сканировать тест</Text>
          <Text style={s.heroSub}>Фото вопроса — ответ за секунды</Text>
        </View>
        <View style={s.heroGo}>
          <Ionicons name="scan" size={22} color="#FFF" />
        </View>
      </Pressable>

      <View style={s.grid}>
        {ROWS.slice(1).map((r) => (
          <Pressable key={r.title} style={s.cell} onPress={() => navigation.navigate(r.route, r.params)}>
            <Ionicons name={r.icon as any} size={24} color={theme.accent} />
            <Text style={s.cellTitle}>{r.title}</Text>
            <Text style={s.cellSub} numberOfLines={2}>{r.sub}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.quota}>
        <Ionicons name="flash" size={16} color={theme.accent} />
        <Text style={s.quotaText}>
          {left === Number.POSITIVE_INFINITY ? 'PRO: без лимитов' : `Бесплатно сегодня: ${left} из ${APO_FREE_DAILY}`}
        </Text>
        <Pressable onPress={() => navigation.navigate('Paywall')}>
          <Text style={s.quotaLink}>PRO</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17' },
    content: { padding: 18, paddingTop: insets.top + 12, paddingBottom: 40 },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    logo: { fontSize: 24, fontWeight: '800', color: '#F2F5F9' },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proBadge: { backgroundColor: '#E8B84B', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
    proText: { fontSize: 11, fontWeight: '800', color: '#0B0F17' },
    iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center' },
    greet: { fontSize: 16, fontWeight: '700', color: '#B9C3D4', marginTop: 18 },
    hero: {
      marginTop: 10, borderRadius: 22, padding: 20, backgroundColor: '#2B4BD8',
      flexDirection: 'row', alignItems: 'center', gap: 14,
    },
    heroTextWrap: { flex: 1 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
    heroSub: { fontSize: 13, color: '#D5DCE8', marginTop: 4 },
    heroGo: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    cell: { width: '31%', flexGrow: 1, backgroundColor: '#131A26', borderRadius: 16, padding: 14, gap: 6 },
    cellTitle: { fontSize: 14, fontWeight: '700', color: '#F2F5F9' },
    cellSub: { fontSize: 11.5, color: '#8A94A6', lineHeight: 15 },
    quota: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: '#131A26', borderRadius: 14, padding: 13 },
    quotaText: { fontSize: 13, color: '#D5DCE8', flex: 1 },
    quotaLink: { fontSize: 13, fontWeight: '800', color: theme.accent },
  });
}
