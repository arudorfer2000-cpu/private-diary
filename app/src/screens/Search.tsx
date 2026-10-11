import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, moodColors, moodNames } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { YMD } from '../calendar/calendarMath';
import type { TFn } from '../i18n/i18n';
import type { Palette } from '../palettes';
import type { StoredEntry } from '../storage/entryRepository';
import { allTags, presetRange, searchEntries, snippet, type DatePreset } from '../search/search';
import { MONTH_NAMES, parseDay } from '../calendar/calendarMath';

type Props = {
  items: StoredEntry[];
  onBack: () => void;
  onOpen: (item: StoredEntry) => void;
  onActivity: () => void;
  today: YMD;
};

const dayLabel = (t: TFn, day: string) => {
  const d = parseDay(day);
  return t('{day} {month} {year}', { day: d.day, month: t(MONTH_NAMES[d.month - 1]), year: d.year });
};

export default function Search({ items, onBack, onOpen, onActivity, today }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [moods, setMoods] = useState<number[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [preset, setPreset] = useState<DatePreset>('any');

  const tags = useMemo(() => allTags(items), [items]);
  const results = useMemo(() => searchEntries(items, { query, moods, tag, ...presetRange(preset, today) }), [items, query, moods, tag, preset, today]);
  const filtering = query.trim() !== '' || moods.length > 0 || tag !== null || preset !== 'any';

  const toggleMood = (m: number) => {
    onActivity();
    setMoods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  };

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back to calendar')} onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('‹ Back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('Search')}</Text>
        <View style={{ width: 64 }} />
      </View>

      <TextInput
        accessibilityLabel={t('Search your diary')}
        placeholder={t('Search your diary')}
        placeholderTextColor={colors.textFaint}
        value={query}
        onChangeText={(v) => {
          onActivity();
          setQuery(v);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={styles.input}
      />
      <Text style={styles.privacy}>{t('Searched on this device. Nothing is sent anywhere.')}</Text>

      <View style={styles.moodRow}>
        {[1, 2, 3, 4, 5].map((m) => {
          const on = moods.includes(m);
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={t('Filter mood: {mood}', { mood: t(moodNames[m]) }) + (on ? ', ' + t('on') : '')}
              onPress={() => toggleMood(m)}
              style={styles.moodBtn}
            >
              <View style={[styles.moodDot, { backgroundColor: moodColors[m] }, on && styles.moodDotOn]} />
            </Pressable>
          );
        })}
      </View>

      {tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScroll} contentContainerStyle={styles.tagRow}>
          {tags.map((tg) => {
            const on = tag !== null && tg.tag.toLocaleLowerCase() === tag.toLocaleLowerCase();
            return (
              <Pressable
                key={tg.tag}
                accessibilityRole="button"
                accessibilityLabel={t('Filter tag: {tag}', { tag: tg.tag }) + (on ? ', ' + t('on') : '')}
                onPress={() => {
                  onActivity();
                  setTag(on ? null : tg.tag);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>#{tg.tag} · {tg.count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.presetRow}>
        {([['any', t('Any time')], ['7d', t('7 days')], ['30d', t('30 days')], ['year', t('This year')]] as [DatePreset, string][]).map(([p, label]) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={t('Date: {range}', { range: label })}
            aria-selected={preset === p}
            onPress={() => {
              onActivity();
              setPreset(p);
            }}
            style={[styles.chip, preset === p && styles.chipOn]}
          >
            <Text style={[styles.chipText, preset === p && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.count}>{filtering ? (results.length === 1 ? t('{n} entry found', { n: 1 }) : t('{n} entries found', { n: results.length })) : t('{n} entries', { n: results.length })}</Text>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {results.length === 0 && (
          <Text style={styles.empty}>{filtering ? t('No entries found') : t('No entries yet')}</Text>
        )}
        {results.map((it) => (
          <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={t('Open entry from {date}, mood {mood}', { date: dayLabel(t, it.day), mood: t(moodNames[it.entry.mood]) })} onPress={() => onOpen(it)} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.dot, { backgroundColor: moodColors[it.entry.mood] }]} />
              <Text style={styles.day}>{dayLabel(t, it.day)}</Text>
            </View>
            <Text style={styles.cardTitle}>{it.entry.title || t('Untitled')}</Text>
            <Text style={styles.cardBody} numberOfLines={3}>{snippet(it.entry.text, query)}</Text>
            {it.entry.tags.length > 0 && <Text style={styles.cardTags}>{it.entry.tags.map((g) => `#${g}`).join('  ')}</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  back: { width: 64, height: 48, justifyContent: 'center' },
  backText: { color: colors.textDim, fontSize: 15, fontFamily: fonts.sansMedium },
  title: { fontSize: 20, color: colors.text, fontFamily: fonts.sansBold },
  input: { flexShrink: 0, marginHorizontal: 20, marginTop: 8, height: 48, borderRadius: 14, paddingHorizontal: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, fontSize: 16, fontFamily: fonts.sans },
  privacy: { marginHorizontal: 20, marginTop: 6, fontSize: 12, color: colors.textFaint, fontFamily: fonts.sans },
  moodRow: { flexShrink: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 6 },
  moodBtn: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
  moodDot: { width: 22, height: 22, borderRadius: 11, opacity: 0.55 },
  moodDotOn: { opacity: 1, borderWidth: 3, borderColor: colors.text },
  presetRow: { flexShrink: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginTop: 6 },
  tagScroll: { flexGrow: 0, flexShrink: 0, marginTop: 2 },
  tagRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13, fontFamily: fonts.sansMedium },
  chipTextOn: { color: colors.accentText },
  count: { marginHorizontal: 20, marginTop: 10, fontSize: 12, color: colors.textDim, fontFamily: fonts.sans },
  list: { padding: 20, paddingTop: 10, gap: 12 },
  empty: { textAlign: 'center', color: colors.textDim, fontSize: 14, paddingTop: 40, fontFamily: fonts.sans },
  card: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  day: { fontSize: 12, color: colors.textDim, fontFamily: fonts.sansBold },
  cardTitle: { fontSize: 17, color: colors.text, marginTop: 6, fontFamily: fonts.sansBold },
  cardBody: { fontSize: 14, lineHeight: 21, color: colors.cardBody, marginTop: 4, fontFamily: fonts.sans },
  cardTags: { fontSize: 13, color: colors.accent, marginTop: 8, fontFamily: fonts.sansMedium },
});
