import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from './apoTheme';
import { useApoUI } from './apoUI';
import { ingestFile } from '../../apo/apoEngine';

interface Props {
  navigation: any;
  route: any;
}

export default function ApoConvertScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { openDrawer } = useApoUI();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const incoming = (route?.params?.files ?? []) as { name: string; uri: string }[];
  const [files, setFiles] = useState(incoming);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const autoStarted = useRef(false);

  const pickDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        const f = res.assets[0];
        setFiles((prev) => [...prev, { name: f.name, uri: f.uri }]);
      }
    } catch (e) {
      console.warn('doc pick error:', e);
    }
  };

  const solveQuestions = async (qs: { stem: string; options: { key: string; text: string }[] }[]) => {
    const q = qs[0];
    if (!q || q.options.length < 2) {
      Alert.alert('Не разобрали', 'Нужно минимум 2 варианта — поправьте текст');
      return;
    }
    navigation.navigate('ApoSolving', {
      question: q.stem,
      options: q.options.map((o) => o.text),
      queue: qs.slice(1).map((x) => ({ question: x.stem, options: x.options.map((o) => o.text) })),
    });
  };

  const startFromFiles = async (list?: { name: string; uri: string }[]) => {
    const target = list ?? files;
    if (target.length === 0) {
      Alert.alert('Нет файлов', 'Добавьте PDF, Word или изображение');
      return;
    }
    setBusy(true);
    try {
      const warns: string[] = [];
      let all: { stem: string; options: { key: string; text: string }[] }[] = [];
      for (const f of target) {
        const r = await ingestFile(f.name, '', f.uri);
        warns.push(...r.warnings.map((w) => `${f.name}: ${w}`));
        all = all.concat(r.questions);
      }
      if (all.length === 0) {
        setWarnings(warns.length ? warns : ['Из файлов текст не извлекся — парсер вложений на стороне движка']);
        setBusy(false);
        return;
      }
      setWarnings(warns);
      await solveQuestions(all);
    } finally {
      setBusy(false);
    }
  };

  // Крит-ситуация: пришли с камеры/галереи — решаем сразу, без лишнего тапа.
  useEffect(() => {
    if (!autoStarted.current && incoming.length > 0) {
      autoStarted.current = true;
      startFromFiles(incoming);
    }
  }, []);

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
      <Text style={s.title}>Подготовка</Text>

      {files.map((f, i) => (
        <View key={i} style={s.file}>
          <Ionicons name="document-text" size={20} color={theme.accent} />
          <View style={s.fileText}>
            <Text style={s.fileName}>{f.name}</Text>
            <Text style={s.fileSub}>к решению</Text>
          </View>
          <Pressable onPress={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
            <Ionicons name="close" size={18} color="#5B6678" />
          </Pressable>
        </View>
      ))}

      <Pressable style={s.addBtn} onPress={pickDoc}>
        <Ionicons name="add" size={18} color={theme.accent} />
        <Text style={s.addText}>Добавить PDF / Word / изображение</Text>
      </Pressable>

      {files.length > 0 && (
        <Pressable style={s.cta} onPress={() => startFromFiles()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={s.ctaText}>Решить из файлов</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </>
          )}
        </Pressable>
      )}

      <Pressable style={s.manual} onPress={() => navigation.navigate('ApoManual')}>
        <Ionicons name="create-outline" size={18} color={theme.accent} />
        <Text style={s.manualText}>Ввести вручную — вопрос и варианты по полям</Text>
      </Pressable>

      {warnings.map((w, i) => (
        <View key={i} style={s.warn}>
          <Ionicons name="warning" size={16} color="#FCD34D" />
          <Text style={s.warnText}>{w}</Text>
        </View>
      ))}
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
    file: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D121C', borderRadius: 12, padding: 12, marginTop: 8 },
    fileText: { flex: 1 },
    fileName: { fontSize: 13.5, fontWeight: '600', color: '#F2F5F9' },
    fileSub: { fontSize: 11.5, color: '#8A94A6', marginTop: 2 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#131A26', borderRadius: 12, padding: 13 },
    addText: { fontSize: 13.5, fontWeight: '600', color: theme.accent },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 15, marginTop: 12, backgroundColor: '#4F7CFF' },
    ctaText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
    manual: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#131A26', borderRadius: 12, padding: 13 },
    manualText: { fontSize: 13.5, fontWeight: '600', color: theme.accent },
    warn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(251,191,36,.07)', borderRadius: 12, padding: 11, marginTop: 8 },
    warnText: { fontSize: 12.5, color: '#B9C3D4', flex: 1 },
  });
}
