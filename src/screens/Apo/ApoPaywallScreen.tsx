import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';
import { isPro, setPro } from '../../core/apo';
import type { ApoSubPlan } from '../../apo/apoTypes';

interface Props {
  navigation: any;
}

const PLANS: { id: ApoSubPlan; title: string; price: string; per: string; feats: string }[] = [
  { id: 'free', title: 'Free', price: '$0', per: '/ навсегда', feats: '20 решений в день · без разборов и истории' },
  { id: 'base', title: 'База', price: '$1.99', per: '/ месяц', feats: '200 решений в день · разборы · история 30 дней' },
  { id: 'unlimited', title: 'Безлимит', price: '$4.99', per: '/ месяц', feats: 'Без лимитов · разборы · история без срока · приоритет' },
];

export default function ApoPaywallScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const [pro, setProState] = useState(false);

  React.useEffect(() => {
    (async () => setProState(await isPro()))();
  }, []);

  const choose = async (p: ApoSubPlan) => {
    // Оплата (RevenueCat / Stripe) — следующая итерация; флаг подписки реальный (core/quota).
    await setPro(p !== 'free');
    setProState(p !== 'free');
    if (p !== 'free') {
      Alert.alert('Тариф выбран', `${p === 'base' ? 'База $1.99/мес' : 'Безлимит $4.99/мес'} — оплата подключается, доступ уже открыт`);
    }
    navigation.goBack();
  };

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
      <Text style={s.logo}>Apo PRO{pro ? ' · активен' : ''}</Text>

      <View style={s.value}>
        <Ionicons name="flash" size={20} color={theme.accent} />
        <Text style={s.valueText}>Ответы за секунды · разбор каждого ответа · история без срока.</Text>
      </View>

      {PLANS.map((p) => (
        <View key={p.id} style={[s.price, p.id === 'base' && s.hot]}>
          <Text style={s.priceTitle}>
            {p.id !== 'free' && <Ionicons name="star" size={15} color={theme.accent} />} {p.title}
          </Text>
          <Text style={s.feats}>{p.feats}</Text>
          <Text style={s.sum}>{p.price} <Text style={s.per}>{p.per}</Text></Text>
          <Pressable style={s.planBtn} onPress={() => choose(p.id)}>
            <Text style={s.planBtnText}>{p.id === 'free' ? 'Остаться на Free' : `Оформить за ${p.price}`}</Text>
          </Pressable>
        </View>
      ))}
      <Text style={s.foot}>Отмена в один тап · RevenueCat / Stripe</Text>
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
    logo: { fontSize: 21, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    value: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#131A26', borderRadius: 16, padding: 14, marginTop: 12 },
    valueText: { fontSize: 13.5, color: '#C6CFDD', flex: 1, lineHeight: 20 },
    price: { borderWidth: 1.5, borderColor: '#232D40', backgroundColor: '#131A26', borderRadius: 18, padding: 16, marginTop: 10 },
    hot: { borderColor: '#4F7CFF' },
    priceTitle: { fontSize: 15, fontWeight: '700', color: '#F2F5F9' },
    feats: { fontSize: 12.5, color: '#8A94A6', marginTop: 5, lineHeight: 18 },
    sum: { fontSize: 26, fontWeight: '800', color: '#F2F5F9', marginTop: 8 },
    per: { fontSize: 12.5, color: '#8A94A6', fontWeight: '400' },
    planBtn: { borderRadius: 12, padding: 12, marginTop: 10, backgroundColor: '#4F7CFF', alignItems: 'center' },
    planBtnText: { fontWeight: '800', fontSize: 14, color: '#FFF' },
    foot: { fontSize: 11, color: '#5B6678', textAlign: 'center', marginTop: 12 },
  });
}
