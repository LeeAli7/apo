import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';
import { isPro, readHistory, APO_KEYS, saveJson, type HistoryEntry } from '../../core/apo';

interface Props {
  navigation: any;
}

const APP_VERSION = '0.2.0 (apo-v2)';

export default function ApoDrawerScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { closeDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const [pro, setProState] = useState(false);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [lang, setLang] = useState<'ru' | 'en'>('ru');

  React.useEffect(() => {
    (async () => {
      setProState(await isPro());
      const h = await readHistory();
      setRecent(h.slice(0, 5));
    })();
  }, []);

  const go = (route: string, params?: any) => {
    closeDrawer();
    navigation.navigate(route, params);
  };

  const signInGoogle = () => {
    Alert.alert('Вход через Google', 'Подключается следующим этапом — аккаунт пока локальный');
  };

  const restorePurchases = () => {
    Alert.alert('Восстановление покупок', 'Проверяем в магазине… подписка не найдена (MVP)');
  };

  const clearCache = async () => {
    await saveJson(APO_KEYS.explainCache, {});
    Alert.alert('Готово', 'Кэш объяснений очищен');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.head}>
        <Text style={s.logo}>Apo</Text>
        <Pressable style={s.iconBtn} onPress={closeDrawer}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={s.status}>{pro ? 'PRO активен' : 'Free · 20 решений в день'}</Text>

      <Text style={s.sect}>Недавние</Text>
      {recent.length === 0 && <Text style={s.empty}>Пока пусто — решите первый тест</Text>}
      {recent.map((h, i) => (
        <View key={i} style={s.hist}>
          <Text style={s.histStem} numberOfLines={2}>{h.stem}</Text>
          <Text style={s.histAns}>{h.choice}{h.lowAccuracy ? ' · перепроверен' : ''}</Text>
        </View>
      ))}
      <Pressable style={s.row} onPress={() => go('ApoHistory')}>
        <Ionicons name="time-outline" size={20} color={theme.accent} />
        <Text style={s.rowText}>Вся история</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </Pressable>

      <Text style={s.sect}>Подписка</Text>
      <Pressable style={s.row} onPress={() => go('Paywall')}>
        <Ionicons name="star" size={20} color={theme.accent} />
        <Text style={s.rowText}>PRO — $1.99 / $4.99</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </Pressable>

      <Text style={s.sect}>Аккаунт</Text>
      <Pressable style={s.row} onPress={signInGoogle}>
        <Ionicons name="logo-google" size={20} color={theme.accent} />
        <Text style={s.rowText}>Войти через Google</Text>
      </Pressable>
      <Pressable style={s.row} onPress={restorePurchases}>
        <Ionicons name="refresh" size={20} color={theme.accent} />
        <Text style={s.rowText}>Восстановить покупки</Text>
      </Pressable>

      <Text style={s.sect}>Настройки</Text>
      <View style={s.row}>
        <Ionicons name="language" size={20} color={theme.accent} />
        <Text style={s.rowText}>Язык: {lang === 'ru' ? 'Русский' : 'English'}</Text>
        <Switch value={lang === 'en'} onValueChange={(v) => setLang(v ? 'en' : 'ru')} />
      </View>
      <Pressable style={s.row} onPress={clearCache}>
        <Ionicons name="trash-outline" size={20} color={theme.accent} />
        <Text style={s.rowText}>Очистить кэш</Text>
      </Pressable>
      <View style={s.rowStatic}>
        <Ionicons name="information-circle-outline" size={20} color={theme.accent} />
        <Text style={s.rowText}>Версия {APP_VERSION}</Text>
      </View>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0D121C' },
    content: { padding: 18, paddingTop: insets.top + 12, paddingBottom: 40 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    logo: { fontSize: 22, fontWeight: '800', color: '#F2F5F9' },
    iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center' },
    status: { fontSize: 12.5, color: '#8A94A6', marginTop: 6 },
    sect: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#5B6678', marginTop: 18, marginBottom: 4 },
    empty: { fontSize: 13, color: '#5B6678' },
    hist: { backgroundColor: '#131A26', borderRadius: 12, padding: 12, marginTop: 6 },
    histStem: { fontSize: 13.5, fontWeight: '600', color: '#F2F5F9' },
    histAns: { fontSize: 12, color: '#8A94A6', marginTop: 3 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#131A26', borderRadius: 12, padding: 13, marginTop: 6 },
    rowStatic: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#131A26', borderRadius: 12, padding: 13, marginTop: 6 },
    rowText: { fontSize: 14, color: '#F2F5F9', flex: 1 },
  });
}
