import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';
import { APO_CONFIDENCE_THRESHOLD } from '../../apo/apoTypes';
import { explainText } from '../../apo/apoEngine';
import { pushHistory } from '../../core/apo';
import { RichText } from './richText';
import type { BatchResult } from './ApoSolvingScreen';

declare const require: any;
function loadClipboard(): any | null {
  try {
    return require('expo-clipboard');
  } catch {
    return null;
  }
}

interface Props {
  navigation: any;
  route: any;
}

const THRESH_PCT = Math.round(APO_CONFIDENCE_THRESHOLD * 100);

export default function ApoResultScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const p = route?.params ?? {};
  // Батч: все решённые вопросы; одиночный вызов — батч из одного.
  const batch: BatchResult[] = p.batch ?? [{
    question: p.question ?? 'Вопрос',
    options: p.options ?? [],
    answerIndex: p.answerIndex ?? 0,
    confidence: p.confidence ?? [],
    ms: p.ms ?? 0,
    lowAccuracy: p.lowAccuracy ?? false,
    refined: false,
  }];
  const [sel, setSel] = useState(0);
  const cur = batch[Math.min(sel, batch.length - 1)];
  const answer = cur.options[cur.answerIndex] ?? '—';
  const [explains, setExplains] = useState<Record<number, string>>({});
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

  useEffect(() => {
    batch.forEach((b, i) => {
      if (b.answerIndex >= 0) {
        const t = b.confidence[b.answerIndex] ?? 0;
        const a = b.options[b.answerIndex] ?? '—';
        pushHistory({ ts: Date.now() + i, stem: b.question, choice: a, confidence: t, lowAccuracy: b.lowAccuracy }).catch(() => {});
      }
    });
  }, []);

  const onExplain = async (idx: number) => {
    const b = batch[idx];
    const a = b.options[b.answerIndex] ?? '—';
    setBusyIdx(idx);
    try {
      const t = await explainText(b.question, a);
      setExplains((prev) => ({ ...prev, [idx]: t }));
    } finally {
      setBusyIdx(null);
    }
  };

  const onCopy = async () => {
    const C = loadClipboard() as any;
    if (C) {
      const text = batch.map((b, i) => {
        const a = b.answerIndex >= 0 ? b.options[b.answerIndex] : '—';
        return `${i + 1}. ${b.question}\nОтвет: ${a}`;
      }).join('\n\n');
      await C.setStringAsync(text);
    }
    Alert.alert('Скопировано', batch.length > 1 ? `Все ответы (${batch.length}) в буфере` : 'Ответ в буфере обмена');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.topbar}>
        <Pressable style={s.back} onPress={() => navigation.navigate('ApoHome')}>
          <Ionicons name="arrow-back" size={18} color="#8A94A6" />
          <Text style={s.backText}>К тестам</Text>
        </Pressable>
        <Pressable style={s.iconBtn} onPress={openDrawer}>
          <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Text style={s.title}>
        {batch.length > 1 ? `Ответы · ${batch.length}` : 'Ответ'}
      </Text>

      {batch.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs}>
          {batch.map((b, i) => {
            const a = b.answerIndex >= 0 ? b.options[b.answerIndex] : '—';
            return (
              <Pressable key={i} style={[s.tab, i === sel && s.tabOn]} onPress={() => setSel(i)}>
                <Text style={[s.tabNum, i === sel && s.tabNumOn]}>{i + 1}</Text>
                <Text style={[s.tabAns, i === sel && s.tabAnsOn]} numberOfLines={1}>
                  {a}{b.refined ? ' *' : ''}{b.lowAccuracy ? ' !' : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={s.ans}>
        <Text style={s.ansLab}>Ответ · {(cur.ms / 1000).toFixed(1)} c</Text>
        <Text style={s.ansBig}>{answer}</Text>
        {cur.refined && (
          <View style={s.refined}>
            <Ionicons name="sparkles" size={14} color="#B9C9EE" />
            <Text style={s.refinedText}>Ответ перепроверен второй моделью</Text>
          </View>
        )}
        {cur.error && (
          <Text style={s.errText}>Не решился — попробуйте ещё раз</Text>
        )}
      </View>

      {cur.lowAccuracy && cur.answerIndex >= 0 && (
        <View style={s.warn}>
          <Ionicons name="warning" size={18} color="#FCD34D" />
          <View style={s.warnTextWrap}>
            <Text style={s.warnTitle}>Точность ниже {THRESH_PCT}% — перепроверяем автоматически</Text>
            <Text style={s.warnSub}>
              Вторая модель уже уточняет ответ. Разбор — по кнопке ниже.
            </Text>
          </View>
        </View>
      )}

      {cur.answerIndex >= 0 && (
        <Pressable style={s.explainBtn} onPress={() => onExplain(sel)} disabled={busyIdx === sel}>
          {busyIdx === sel ? (
            <ActivityIndicator color="#B9C9EE" />
          ) : (
            <>
              <Ionicons name="document-text" size={18} color="#B9C9EE" />
              <Text style={s.explainText}>Объяснить подробнее</Text>
            </>
          )}
        </Pressable>
      )}

      {explains[sel] && (
        <View style={s.card}>
          <RichText text={explains[sel]} />
        </View>
      )}

      <View style={s.actions}>
        <Pressable style={s.chip} onPress={onCopy}>
          <Ionicons name="copy-outline" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>Копировать{batch.length > 1 ? ' всё' : ''}</Text>
        </Pressable>
        <Pressable style={s.chip} onPress={() => navigation.navigate('ApoHome')}>
          <Ionicons name="add" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>Следующий</Text>
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
    back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backText: { color: '#8A94A6', fontSize: 13, fontWeight: '600' },
    iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 21, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    tabs: { marginTop: 10 },
    tab: { width: 120, backgroundColor: '#131A26', borderRadius: 12, padding: 10, marginRight: 8, borderWidth: 1.5, borderColor: 'transparent' },
    tabOn: { borderColor: '#4F7CFF' },
    tabNum: { fontSize: 16, fontWeight: '800', color: '#8A94A6' },
    tabNumOn: { color: '#FFF' },
    tabAns: { fontSize: 12, color: '#8A94A6', marginTop: 2 },
    tabAnsOn: { color: '#D5DCE8' },
    ans: { borderRadius: 16, padding: 16, marginTop: 12, backgroundColor: 'rgba(52,211,153,.08)', borderWidth: 1.5, borderColor: '#34D399' },
    ansLab: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#34D399', textTransform: 'uppercase' },
    ansStem: { fontSize: 13.5, color: '#B9C3D4', marginTop: 6, lineHeight: 19 },
    ansBig: { fontSize: 18, fontWeight: '800', color: '#F2F5F9', marginTop: 4 },
    refined: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: 'rgba(79,124,255,.12)', borderRadius: 10, padding: 8 },
    refinedText: { fontSize: 12.5, color: '#B9C9EE', fontWeight: '600' },
    errText: { fontSize: 13, color: '#FCA5A5', marginTop: 8 },
    prob: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#161D2A' },
    probText: { fontSize: 13.5, color: '#B9C3D4', flex: 1 },
    probVal: { fontSize: 13.5, fontWeight: '800', color: '#F2F5F9' },
    warn: { flexDirection: 'row', gap: 10, marginTop: 10, borderWidth: 1.5, borderColor: 'rgba(251,191,36,.5)', backgroundColor: 'rgba(251,191,36,.07)', borderRadius: 14, padding: 13 },
    warnTextWrap: { flex: 1 },
    warnTitle: { fontSize: 13.5, fontWeight: '700', color: '#FCD34D' },
    warnSub: { fontSize: 12.5, color: '#B9C3D4', marginTop: 4, lineHeight: 18 },
    explainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, borderWidth: 1.5, borderColor: '#4F7CFF', borderRadius: 12, padding: 12 },
    explainText: { fontSize: 13.5, fontWeight: '800', color: '#B9C9EE' },
    card: { backgroundColor: '#131A26', borderRadius: 16, padding: 14, marginTop: 10 },
    expl: { fontSize: 13.5, lineHeight: 21, color: '#C6CFDD' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#131A26', borderRadius: 12, padding: 12 },
    chipText: { fontSize: 13, fontWeight: '700', color: '#D5DCE8' },
  });
}
