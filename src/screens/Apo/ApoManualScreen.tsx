import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';

interface Props {
  navigation: any;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function ApoManualScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const [stem, setStem] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const setOpt = (i: number, v: string) => {
    setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  };

  const addOpt = () => {
    if (options.length >= 8) {
      Alert.alert('Хватит', 'Максимум 8 вариантов');
      return;
    }
    setOptions((prev) => [...prev, '']);
  };

  const delOpt = (i: number) => {
    if (options.length <= 2) {
      Alert.alert('Нужно минимум', 'Оставьте хотя бы 2 варианта');
      return;
    }
    setOptions((prev) => prev.filter((_, j) => j !== i));
  };

  const canSolve = stem.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  const onSolve = () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!stem.trim()) {
      Alert.alert('Нет вопроса', 'Впишите текст вопроса');
      return;
    }
    if (clean.length < 2) {
      Alert.alert('Мало вариантов', 'Нужно минимум 2 заполненных варианта');
      return;
    }
    navigation.navigate('ApoSolving', { question: stem.trim(), options: clean, queue: [] });
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.topbar}>
        <Pressable style={s.back} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color="#8A94A6" />
          <Text style={s.backText}>Назад</Text>
        </Pressable>
        <Pressable style={s.iconBtn} onPress={openDrawer}>
          <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={s.title}>Новый вопрос</Text>

      <Text style={s.lab}>Вопрос</Text>
      <TextInput
        style={s.q}
        multiline
        placeholder="Впишите вопрос"
        placeholderTextColor="#5B6678"
        value={stem}
        onChangeText={setStem}
      />

      <Text style={s.lab}>Варианты ({options.filter((o) => o.trim()).length} заполнено)</Text>
      {options.map((o, i) => (
        <View key={i} style={s.optRow}>
          <View style={s.key}>
            <Text style={s.keyText}>{LETTERS[i] ?? i + 1}</Text>
          </View>
          <TextInput
            style={s.opt}
            placeholder={`Вариант ${LETTERS[i] ?? i + 1}`}
            placeholderTextColor="#5B6678"
            value={o}
            onChangeText={(v) => setOpt(i, v)}
          />
          <Pressable style={s.del} onPress={() => delOpt(i)} hitSlop={8}>
            <Ionicons name="close" size={18} color="#5B6678" />
          </Pressable>
        </View>
      ))}

      <Pressable style={s.add} onPress={addOpt}>
        <Ionicons name="add" size={18} color={theme.accent} />
        <Text style={s.addText}>Добавить вариант</Text>
      </Pressable>

      <Pressable style={[s.cta, !canSolve && s.ctaOff]} onPress={onSolve}>
        <Text style={s.ctaText}>Решить</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFF" />
      </Pressable>
      {!canSolve && (
        <Text style={s.hint}>Заполните вопрос и минимум 2 варианта</Text>
      )}
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
    title: { fontSize: 22, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    lab: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#5B6678', marginTop: 16, marginBottom: 6 },
    q: { backgroundColor: '#0D121C', borderWidth: 1.5, borderColor: '#4F7CFF', borderRadius: 12, padding: 12, fontSize: 15, color: '#F2F5F9', minHeight: 84, textAlignVertical: 'top' },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D121C', borderRadius: 12, padding: 8, paddingLeft: 8, marginTop: 8 },
    key: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#22304A', alignItems: 'center', justifyContent: 'center' },
    keyText: { fontWeight: '800', fontSize: 13, color: '#B9C3D4' },
    opt: { flex: 1, fontSize: 14, color: '#F2F5F9', paddingVertical: 8 },
    del: { padding: 6 },
    add: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#131A26', borderRadius: 12, padding: 13 },
    addText: { fontSize: 13.5, fontWeight: '600', color: theme.accent },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 15, marginTop: 14, backgroundColor: '#4F7CFF' },
    ctaOff: { opacity: 0.45 },
    ctaText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
    hint: { textAlign: 'center', fontSize: 12.5, color: '#5B6678', marginTop: 8 },
  });
}
