import { useEffect, useState, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, moodColors, moodNames } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import type { Entries } from '../types';
import type { StoredEntry } from '../storage/entryRepository';
import { MONTH_NAMES, daysInMonth, isFuture, leadingBlanks, weekdayName, type YM, type YMD } from '../calendar/calendarMath';

type Props = {
  view: YM;
  today: YMD;
  entries: Entries; // day of month -> entry, for the viewed month only
  streakDays: number;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Dev readout for check D5: how long the passcode unlock took on this phone. */
  unlockMs: number | null;
  onLock: () => void;
  onOpenTrash: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenInsights: () => void;
  /** Both receive the selected day of the month. */
  onDictate: (day: number) => void;
  onWrite: (day: number) => void;
  /** Start one more entry on a day that already has some. */
  onWriteAnother: (day: number) => void;
  /** All entries of the month by day, newest first. */
  dayEntries: Record<number, StoredEntry[]>;
  /** Entries from earlier years on this month and day. */
  loadThrowbacks: (month: number, day: number, beforeYear: number) => Promise<StoredEntry[]>;
  onOpenEntry: (item: StoredEntry) => void;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar({ view, today, entries, streakDays, canNext, onPrev, onNext, unlockMs, onLock, onOpenTrash, onOpenSearch, onOpenSettings, onOpenInsights, onDictate, onWrite, onWriteAnother, dayEntries, loadThrowbacks, onOpenEntry }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isCurrent = view.year === today.year && view.month === today.month;
  const [selected, setSelected] = useState(isCurrent ? today.day : 1);

  const written = Object.keys(entries).length;
  const selEntry = entries[selected];
  const selIsToday = isCurrent && selected === today.day;
  const future = (n: number) => isFuture(view, n, today);
  const isPast = !future(selected);
  const monthName = t(MONTH_NAMES[view.month - 1]);
  const [throwbacks, setThrowbacks] = useState<StoredEntry[]>([]);
  useEffect(() => {
    let alive = true;
    if (!isPast) {
      setThrowbacks([]);
      return;
    }
    loadThrowbacks(view.month, selected, view.year).then(
      (r) => alive && setThrowbacks(r),
      () => alive && setThrowbacks([]),
    );
    return () => {
      alive = false;
    };
  }, [view.month, view.year, selected, isPast, loadThrowbacks, entries]);
  const dayName = (n: number, e: Entries[number] | undefined) =>
    [
      t('{day} {month}', { day: n, month: monthName }),
      isCurrent && n === today.day ? t('today') : '',
      e ? t('entry written') : t('no entry'),
      e ? t('mood {mood}', { mood: t(moodNames[e.mood]) }) : '',
      n === selected ? t('selected') : '',
    ]
      .filter(Boolean)
      .join(', ');

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks(view)).fill(null),
    ...Array.from({ length: daysInMonth(view) }, (_, i) => i + 1),
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.rootContent}>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Settings')} onPress={onOpenSettings} style={styles.lockBtn}>
          <Text style={styles.lockGlyph}>⚙️</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Insights')} onPress={onOpenInsights} style={styles.lockBtn}>
          <Text style={styles.lockGlyph}>📊</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Search')} onPress={onOpenSearch} style={styles.lockBtn}>
          <Text style={styles.lockGlyph}>🔍</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Open trash')} onPress={onOpenTrash} style={styles.lockBtn}>
          <Text style={styles.lockGlyph}>🗑</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Lock diary now')} onPress={onLock} style={styles.lockBtn}>
          <Text style={styles.lockGlyph}>🔒</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <View style={styles.monthNav}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Previous month')} onPress={onPrev} style={styles.navBtn}>
            <Text style={styles.navGlyph}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.month}>{monthName} {view.year}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Next month')}
            aria-disabled={!canNext}
            disabled={!canNext}
            onPress={onNext}
            style={[styles.navBtn, !canNext && styles.navDisabled]}
          >
            <Text style={styles.navGlyph}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statBig}>{written === 1 ? t('{n} entry', { n: written }) : t('{n} entries', { n: written })}</Text>
          <Text style={styles.statSmall}>{t('this month')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statBig}>{streakDays === 1 ? t('{n} day', { n: streakDays }) : t('{n} days', { n: streakDays })}</Text>
          <Text style={styles.statSmall}>{t('writing streak')}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>{t(d)}</Text>
        ))}
        {cells.map((n, i) => {
          if (n === null) return <View key={i} style={styles.cell} />;
          const e = entries[n];
          const bg = e ? moodColors[e.mood] : colors.card;
          const isSel = n === selected;
          return (
            <View key={i} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={dayName(n, e)}
                aria-selected={isSel}
                onPress={() => setSelected(n)}
                style={[
                  styles.day,
                  { backgroundColor: !future(n) ? bg : 'transparent' },
                  isCurrent && n === today.day && styles.dayToday,
                  isSel && styles.daySelected,
                ]}
              >
                <Text style={[styles.dayText, { color: e ? colors.bg : !future(n) ? colors.textDim : colors.textFaint }]}>{n}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        {[1, 2, 3, 4, 5].map((m) => (
          <View key={m} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: moodColors[m] }]} />
            <Text style={styles.legendText}>{t(moodNames[m])}</Text>
          </View>
        ))}
      </View>

      <View style={styles.preview}>
        <View style={styles.previewTop}>
          <Text style={styles.previewDate}>
            {t('{weekday} {day} {month}', { weekday: t(weekdayName({ ...view, day: selected })), day: selected, month: monthName })}
          </Text>
          <Text style={styles.previewMood}>{selEntry ? t('Mood: {mood}', { mood: t(moodNames[selEntry.mood]) }) : selIsToday ? t('Today') : t('No entry')}</Text>
        </View>
        <Text style={styles.previewTitle}>
          {selEntry ? selEntry.title || t('Untitled') : selIsToday ? t('Nothing written yet today') : t('No entry for this day')}
        </Text>
        <Text style={styles.previewBody} numberOfLines={3}>
          {selEntry
            ? selEntry.text
            : selIsToday
              ? t('Talk it out or type it, whichever feels easier tonight.')
              : isPast
                ? t('You can still add one for this date.')
                : t('This day has not happened yet.')}
        </Text>
        {selEntry && selEntry.tags.length > 0 && (
          <Text style={styles.previewTags}>{selEntry.tags.map((g) => `#${g}`).join('  ')}</Text>
        )}
        {(dayEntries[selected]?.length ?? 0) > 1 && (
          <View style={styles.moreBox}>
            <Text accessibilityRole="header" style={styles.moreHead}>{t('More entries on this day')}</Text>
            {dayEntries[selected].slice(1).map((it) => (
              <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={t('Open another entry: {title}', { title: it.entry.title || t('Untitled') })} onPress={() => onOpenEntry(it)} style={styles.moreBtn}>
                <Text style={styles.moreBtnText} numberOfLines={1}>↗ {it.entry.title || t('Untitled')}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {isPast && selEntry && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Add another entry')} onPress={() => onWriteAnother(selected)} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>＋ {t('Add another entry')}</Text>
          </Pressable>
        )}
        {isPast && (
          <View style={styles.btnRow}>
            <Pressable accessibilityRole="button" onPress={() => onDictate(selected)} style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnPrimaryText}>{t('Dictate')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onWrite(selected)} style={[styles.btn, styles.btnOutline]}>
              <Text style={styles.btnOutlineText}>{selEntry ? t('Edit') : t('Write')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {throwbacks.length > 0 && (
        <View style={styles.throwbacks}>
          <Text accessibilityRole="header" style={styles.throwHead}>{t('On this day')}</Text>
          {throwbacks.map((it) => (
            <Pressable
              key={it.id}
              accessibilityRole="button"
              accessibilityLabel={t('Open entry from {date}, mood {mood}', { date: t('{day} {month} {year}', { day: selected, month: monthName, year: it.day.slice(0, 4) }), mood: t(moodNames[it.entry.mood]) })}
              onPress={() => onOpenEntry(it)}
              style={styles.throwCard}
            >
              <View style={[styles.throwDot, { backgroundColor: moodColors[it.entry.mood] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.throwYear}>{it.day.slice(0, 4)}{it.entry.title ? ' · ' + it.entry.title : ''}</Text>
                <Text style={styles.throwText} numberOfLines={2}>{it.entry.text}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {unlockMs !== null && (
        <Text style={styles.dev}>{t('Test build: passcode unlock took {s} s', { s: (unlockMs / 1000).toFixed(1) })}</Text>
      )}
    </ScrollView>
  );
}

const CELL = `${100 / 7}%` as const;

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 8 },
  rootContent: { paddingBottom: 24 },
  moreBox: { marginTop: 8 },
  moreHead: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textDim, fontFamily: fonts.sansBold },
  moreBtn: { minHeight: 44, justifyContent: 'center' },
  moreBtnText: { color: colors.accent, fontSize: 14, fontFamily: fonts.sansMedium },
  throwbacks: { marginHorizontal: 20, gap: 8 },
  throwHead: { fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textDim, fontFamily: fonts.sansBold, marginTop: 4 },
  throwCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  throwDot: { width: 10, height: 10, borderRadius: 5 },
  throwYear: { fontSize: 13, color: colors.textDim, fontFamily: fonts.sansMedium },
  throwText: { fontSize: 14, color: colors.text, fontFamily: fonts.serif, marginTop: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingRight: 20 },
  monthNav: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  navDisabled: { opacity: 0.25 },
  navGlyph: { fontSize: 28, color: colors.text, fontFamily: fonts.sansMedium },
  month: { fontSize: 22, color: colors.text, fontFamily: fonts.sansBold },
  lockBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  lockGlyph: { fontSize: 20 },
  stats: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },
  stat: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: colors.card },
  statBig: { fontSize: 20, color: colors.text, fontFamily: fonts.sansBold },
  statSmall: { fontSize: 12, color: colors.textDim, fontFamily: fonts.sans },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 },
  weekday: { width: CELL, textAlign: 'center', fontSize: 12, color: colors.textFaint, paddingBottom: 6, fontFamily: fonts.sansMedium },
  cell: { width: CELL, alignItems: 'center', paddingVertical: 3 },
  day: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: colors.textDim },
  daySelected: { borderWidth: 2.5, borderColor: colors.accent },
  dayText: { fontSize: 14, fontFamily: fonts.sansBold },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.textDim, fontFamily: fonts.sans },
  preview: { margin: 20, marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  previewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  previewDate: { fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: fonts.sansBold },
  previewMood: { fontSize: 12, color: colors.textDim, fontFamily: fonts.sans },
  previewTitle: { fontSize: 17, color: colors.text, marginTop: 6, fontFamily: fonts.sansBold },
  previewBody: { fontSize: 14, lineHeight: 21, color: colors.cardBody, marginTop: 4, fontFamily: fonts.sans },
  previewTags: { fontSize: 13, color: colors.accent, marginTop: 8, fontFamily: fonts.sansMedium },
  dev: { textAlign: 'center', fontSize: 11, color: colors.textFaint, paddingBottom: 8, fontFamily: fonts.sans },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.accentText, fontSize: 14, fontFamily: fonts.sansBold },
  btnOutline: { borderWidth: 1, borderColor: colors.outline },
  btnOutlineText: { color: colors.text, fontSize: 14, fontFamily: fonts.sansBold },
});
