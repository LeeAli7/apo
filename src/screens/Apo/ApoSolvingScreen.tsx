import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { solveTest, quotaConsume, quotaLeft } from '../../apo/apoEngine';
import type { ApoSolveResult } from '../../apo/apoTypes';

interface Props {
  navigation: any;
  route: any;
}

export interface BatchItem {
  question: string;
  options: string[];
}

export interface BatchResult extends BatchItem {
  answerIndex: number;
  confidence: number[];
  ms: number;
  lowAccuracy: boolean;
  refined: boolean;
  error?: string;
}

export default function ApoSolvingScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const first: BatchItem = {
    question: route?.params?.question ?? 'Вопрос',
    options: route?.params?.options ?? [],
  };
  const queue: BatchItem[] = route?.params?.queue ?? [];
  const items = [first, ...queue].filter((q) => q.options.length > 0);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const results: BatchResult[] = [];
        for (let i = 0; i < items.length; i++) {
          const q = await quotaLeft();
          if (q.left <= 0) {
            if (alive) navigation.replace('Paywall');
            return;
          }
          let r: ApoSolveResult;
          try {
            r = await solveTest(items[i].question, items[i].options);
            await quotaConsume();
          } catch {
            r = { answerIndex: -1, confidence: [], ms: 0, lowAccuracy: true };
          }
          const top = r.answerIndex >= 0 ? r.confidence[r.answerIndex] ?? 0 : 0;
          results.push({
            ...items[i],
            answerIndex: r.answerIndex,
            confidence: r.confidence,
            ms: r.ms,
            lowAccuracy: r.lowAccuracy,
            refined: r.refined ?? (r.answerIndex >= 0 && top < 0.8),
            error: r.answerIndex < 0 ? 'no-answer' : undefined,
          });
          if (alive) setDone(i + 1);
        }
        if (alive) {
          navigation.replace('ApoResult', {
            batch: results,
            question: results[0]?.question ?? first.question,
            options: results[0]?.options ?? first.options,
            answerIndex: results[0]?.answerIndex ?? -1,
            confidence: results[0]?.confidence ?? [],
            ms: results.reduce((a, r) => a + r.ms, 0),
            lowAccuracy: results[0]?.lowAccuracy ?? true,
          });
        }
      } catch (e) {
        if (alive) setError('Не удалось решить — попробуйте ещё раз');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={s.container}>
      <Pressable style={s.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#8A94A6" />
        <Text style={s.backText}>Отмена</Text>
      </Pressable>
      <Text style={s.title}>Решаю{items.length > 1 ? ` · ${done}/${items.length}` : ''}</Text>
      <View style={s.card}>
        <Text style={s.q} numberOfLines={3}>{items[Math.min(done, items.length - 1)]?.question}</Text>
        {error ? (
          <>
            <Text style={s.err}>{error}</Text>
            <Pressable style={s.cta} onPress={() => navigation.goBack()}>
              <Text style={s.ctaText}>Назад</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#4F7CFF" style={s.spin} />
            <Text style={s.hint}>
              {items.length > 1 ? `Вопрос ${Math.min(done + 1, items.length)} из ${items.length}` : 'Варианты оцениваются параллельно'}
            </Text>
            {items.length > 1 && (
              <View style={s.bar}><View style={[s.fill, { width: `${(done / items.length) * 100}%` }]} /></View>
            )}
          </>
        )}
      </View>
      <Text style={s.ghost}>Повторный вопрос отдаст кэш — мгновенно</Text>
    </View>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17', padding: 18, paddingTop: insets.top + 12 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backText: { color: '#8A94A6', fontSize: 13, fontWeight: '600' },
    title: { fontSize: 21, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    card: { backgroundColor: '#131A26', borderRadius: 16, padding: 16, marginTop: 12 },
    q: { fontSize: 16, fontWeight: '700', color: '#F2F5F9', lineHeight: 22 },
    spin: { marginTop: 22 },
    hint: { textAlign: 'center', fontSize: 13, color: '#8A94A6', marginTop: 10 },
    bar: { height: 6, backgroundColor: '#1B2332', borderRadius: 99, marginTop: 12, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: '#4F7CFF', borderRadius: 99 },
    err: { fontSize: 14, color: '#FCA5A5', marginTop: 16, textAlign: 'center' },
    cta: { borderRadius: 12, padding: 12, marginTop: 12, backgroundColor: '#4F7CFF', alignItems: 'center' },
    ctaText: { fontWeight: '800', color: '#FFF' },
    ghost: { textAlign: 'center', fontSize: 13, color: '#5B6678', marginTop: 14 },
  });
}
