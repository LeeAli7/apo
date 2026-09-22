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

export default function ApoResultScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const p = route?.params ?? {};
  const question: string = p.question ?? 'Вопрос';
  const options: string[] = p.options ?? [];
  const answerIndex: number = p.answerIndex ?? 0;
  const confidence: number[] = p.confidence ?? [];
  const ms: number = p.ms ?? 0;
  const lowAccuracy: boolean = p.lowAccuracy ?? false;
  const queue: { question: string; options: string[] }[] = p.queue ?? [];
  const answer = options[answerIndex] ?? '—';
  const top = confidence[answerIndex] ?? 0;
  const [explain, setExplain] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);

  useEffect(() => {
    if (p.question) {
      pushHistory({ ts: Date.now(), stem: question, choice: answer, confidence: top, lowAccuracy }).catch(() => {});
    }
  }, []);

  const nextInQueue = queue[0];

  const onNext = () => {
    if (nextInQueue) {
      navigation.replace('ApoSolving', {
        question: nextInQueue.question,
        options: nextInQueue.options,
        queue: queue.slice(1),
      });
    } else {
      navigation.navigate('ApoHome');
    }
  };

  const onExplain = async () => {
    setExplainBusy(true);
    try {
      const t = await explainText(question, answer);
      setExplain(t);
    } finally {
      setExplainBusy(false);
    }
  };

  const onCopy = async () => {
    const C = loadClipboard() as any;
    if (C) await C.setStringAsync(`${question}\nОтвет: ${answer}`);
    Alert.alert('Скопировано', 'Ответ в буфере обмена');
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

      <View style={s.ans}>
        <Text style={s.ansLab}>Ответ · {(ms / 1000).toFixed(1)} c</Text>
        <Text style={s.ansBig}>{answer}</Text>
        {options.map((o, i) => (
          <View key={i} style={s.prob}>
            <Text style={s.probText}>{o}</Text>
            <Text style={s.probVal}>{Math.round((confidence[i] ?? 0) * 100)}%</Text>
          </View>
        ))}
      </View>

      {lowAccuracy && (
        <View style={s.warn}>
          <Ionicons name="warning" size={18} color="#FCD34D" />
          <View style={s.warnTextWrap}>
            <Text style={s.warnTitle}>Точность ниже 75% — проверьте ответ</Text>
            <Text style={s.warnSub}>
              Уверенность {Math.round(top * 100)}%, порог {(APO_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%.
              Разбор — по кнопке ниже.
            </Text>
          </View>
        </View>
      )}

      <Pressable style={s.explainBtn} onPress={onExplain} disabled={explainBusy}>
        {explainBusy ? (
          <ActivityIndicator color="#B9C9EE" />
        ) : (
          <>
            <Ionicons name="document-text" size={18} color="#B9C9EE" />
            <Text style={s.explainText}>Объяснить подробнее</Text>
          </>
        )}
      </Pressable>

      {explain && (
        <View style={s.card}>
          <Text style={s.expl}>{explain}</Text>
        </View>
      )}

      <View style={s.actions}>
        <Pressable style={s.chip} onPress={onCopy}>
          <Ionicons name="copy-outline" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>Копировать</Text>
        </Pressable>
        <Pressable style={s.chip} onPress={onNext}>
          <Ionicons name="add" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>{nextInQueue ? `Дальше (${queue.length})` : 'Следующий'}</Text>
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
    ans: { borderRadius: 16, padding: 16, marginTop: 12, backgroundColor: 'rgba(52,211,153,.08)', borderWidth: 1.5, borderColor: '#34D399' },
    ansLab: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#34D399', textTransform: 'uppercase' },
    ansBig: { fontSize: 18, fontWeight: '800', color: '#F2F5F9', marginTop: 4 },
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
