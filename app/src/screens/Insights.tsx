import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, moodColors, moodNames } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import type { StoredEntry } from '../storage/entryRepository';
import { MONTH_NAMES, type YMD } from '../calendar/calendarMath';
import { computeInsights } from '../insights/insights';

type Props = { items: StoredEntry[]; today: YMD; onBack: () => void };

const CHART_H = 96;

export default function Insights({ items, today, onBack }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const r = useMemo(() => computeInsights(items, today), [items, today]);

  const monthShort = (m: string) => t(MONTH_NAMES[Number(m.slice(5, 7)) - 1]).slice(0, 3);
  const monthMax = Math.max(1, ...r.perMonth.map((m) => m.count));
  const monthSummary = r.perMonth.map((m) => `${monthShort(m.month)} ${m.month.slice(0, 4)}: ${m.count}`).join(', ');
  const weekSummary = r.moodByWeek
    .filter((w) => w.avg !== null)
    .map((w) => t('Week of {date}: average {avg}', { date: w.weekStart, avg: w.avg ?? 0 }))
    .join(', ');

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back to calendar')} onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('‹ Back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('Insights')}</Text>
        <View style={{ width: 64 }} />
      </View>

      {r.totalEntries === 0 ? (
        <Text style={styles.empty}>{t('Write a few entries first. Insights appear here, calculated on this device.')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.cards}>
            {[
              [t('Entries'), String(r.totalEntries)],
              [t('Words'), String(r.totalWords)],
              [t('Words per entry'), String(r.avgWords)],
              [t('Current streak'), String(r.currentStreak)],
              [t('Longest streak'), String(r.longestStreak)],
            ].map(([label, value]) => (
              <View key={label} style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}>
                <Text style={styles.cardValue}>{value}</Text>
                <Text style={styles.cardLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={styles.heading}>{t('Mood by week')}</Text>
          <Text style={styles.help}>{t('Last 12 weeks. Average mood from 1 (very low) to 5 (great).')}</Text>
          <View style={styles.chart} accessible accessibilityLabel={weekSummary === '' ? t('No data') : weekSummary}>
            {r.moodByWeek.map((w) => (
              <View key={w.weekStart} style={styles.col}>
                <Text style={styles.val}>{w.avg === null ? '' : w.avg}</Text>
                <View style={[styles.bar, { height: w.avg === null ? 2 : (w.avg / 5) * CHART_H, backgroundColor: w.avg === null ? colors.outline : moodColors[Math.round(w.avg)] }]} />
                <Text style={styles.lab}>{Number(w.weekStart.slice(8, 10))}</Text>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={styles.heading}>{t('Entries per month')}</Text>
          <View style={styles.chart} accessible accessibilityLabel={monthSummary}>
            {r.perMonth.map((m) => (
              <View key={m.month} style={styles.col}>
                <Text style={styles.val}>{m.count === 0 ? '' : m.count}</Text>
                <View style={[styles.bar, { height: m.count === 0 ? 2 : (m.count / monthMax) * CHART_H, backgroundColor: m.count === 0 ? colors.outline : colors.accent }]} />
                <Text style={styles.lab}>{monthShort(m.month)}</Text>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={styles.heading}>{t('Mood overview')}</Text>
          {[5, 4, 3, 2, 1].map((m) => (
            <View key={m} style={styles.row} accessible accessibilityLabel={`${t(moodNames[m])}: ${r.moodCounts[m]}`}>
              <View style={[styles.dot, { backgroundColor: moodColors[m] }]} />
              <Text style={styles.rowText}>{t(moodNames[m])}</Text>
              <Text style={styles.rowNum}>{r.moodCounts[m]}</Text>
            </View>
          ))}

          {r.topTags.length > 0 && (
            <>
              <Text accessibilityRole="header" style={styles.heading}>{t('Tags and mood')}</Text>
              {r.topTags.map((tg) => (
                <View key={tg.tag} style={styles.row} accessible accessibilityLabel={`${tg.tag}: ${tg.count === 1 ? t('{n} entry', { n: 1 }) : t('{n} entries', { n: tg.count })}, ${t('average mood {avg}', { avg: tg.avgMood })}`}>
                  <Text style={styles.rowText}>#{tg.tag}</Text>
                  <Text style={styles.rowSmall}>{tg.count === 1 ? t('{n} entry', { n: 1 }) : t('{n} entries', { n: tg.count })} · {t('average mood {avg}', { avg: tg.avgMood })}</Text>
                </View>
              ))}
            </>
          )}
          <Text style={styles.privacy}>{t('Calculated on this device. Nothing is sent anywhere.')}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  back: { width: 64, height: 48, justifyContent: 'center' },
  backText: { color: colors.textDim, fontSize: 15, fontFamily: fonts.sansMedium },
  title: { fontSize: 20, color: colors.text, fontFamily: fonts.sansBold },
  empty: { textAlign: 'center', color: colors.textDim, fontSize: 14, padding: 40, lineHeight: 21, fontFamily: fonts.sans },
  body: { padding: 20, paddingBottom: 40 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '31%', flexGrow: 1, padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  cardValue: { fontSize: 24, color: colors.text, fontFamily: fonts.sansBold },
  cardLabel: { fontSize: 12, color: colors.textDim, marginTop: 2, fontFamily: fonts.sans },
  heading: { fontSize: 16, color: colors.text, marginTop: 26, marginBottom: 4, fontFamily: fonts.sansBold },
  help: { fontSize: 12, color: colors.textDim, marginBottom: 8, fontFamily: fonts.sans },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: CHART_H + 40, paddingTop: 4 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  val: { fontSize: 10, color: colors.textDim, height: 14, fontFamily: fonts.sans },
  bar: { width: '70%', borderRadius: 4 },
  lab: { fontSize: 10, color: colors.textDim, marginTop: 4, height: 14, fontFamily: fonts.sans },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { flex: 1, fontSize: 15, color: colors.text, fontFamily: fonts.sansMedium },
  rowNum: { fontSize: 15, color: colors.text, fontFamily: fonts.sansBold },
  rowSmall: { fontSize: 13, color: colors.textDim, fontFamily: fonts.sans },
  privacy: { textAlign: 'center', fontSize: 12, color: colors.textFaint, marginTop: 24, fontFamily: fonts.sans },
});
