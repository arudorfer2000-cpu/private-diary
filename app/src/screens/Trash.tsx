import { useState, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import { TRASH_DAYS, type StoredEntry } from '../storage/entryRepository';

type Props = {
  items: StoredEntry[];
  now: number;
  onBack: () => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onEmpty: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * DAY_MS - now) / DAY_MS));
}

export default function Trash({ items, now, onBack, onRestore, onDeleteForever, onEmpty }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Destructive actions need a second tap on the same button.
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back to calendar')} onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('‹ Back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('Trash')}</Text>
        <View style={{ width: 64 }} />
      </View>
      <Text style={styles.hint}>{t('Entries are removed for good after {n} days.', { n: TRASH_DAYS })}</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {items.length === 0 && <Text style={styles.empty}>{t('The trash is empty.')}</Text>}
        {items.map((it) => (
          <View key={it.id} style={styles.card}>
            <Text style={styles.day}>{t('{date} · {n} days left', { date: it.day, n: daysLeft(it.deletedAt ?? now, now) })}</Text>
            <Text style={styles.cardTitle}>{it.entry.title || t('Untitled')}</Text>
            <Text style={styles.cardBody} numberOfLines={2}>{it.entry.text}</Text>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" onPress={() => onRestore(it.id)} style={[styles.btn, styles.primary]}>
                <Text style={styles.primaryText}>{t('Restore')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (confirm === it.id) {
                    setConfirm(null);
                    onDeleteForever(it.id);
                  } else setConfirm(it.id);
                }}
                style={[styles.btn, styles.outline]}
              >
                <Text style={styles.outlineText}>{confirm === it.id ? t('Tap again to delete') : t('Delete forever')}</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {items.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (confirm === 'all') {
                setConfirm(null);
                onEmpty();
              } else setConfirm('all');
            }}
            style={styles.emptyBtn}
          >
            <Text style={styles.outlineText}>{confirm === 'all' ? t('Tap again to empty the trash') : t('Empty trash')}</Text>
          </Pressable>
        )}
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
  hint: { textAlign: 'center', fontSize: 12, color: colors.textFaint, paddingBottom: 8, fontFamily: fonts.sans },
  list: { padding: 20, gap: 12 },
  empty: { textAlign: 'center', color: colors.textDim, fontSize: 14, paddingTop: 40, fontFamily: fonts.sans },
  card: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  day: { fontSize: 12, color: colors.textDim, fontFamily: fonts.sansBold },
  cardTitle: { fontSize: 17, color: colors.text, marginTop: 6, fontFamily: fonts.sansBold },
  cardBody: { fontSize: 14, lineHeight: 21, color: colors.cardBody, marginTop: 4, fontFamily: fonts.sans },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.accentText, fontSize: 14, fontFamily: fonts.sansBold },
  outline: { borderWidth: 1, borderColor: colors.outline },
  outlineText: { color: colors.text, fontSize: 14, fontFamily: fonts.sansBold },
  emptyBtn: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
