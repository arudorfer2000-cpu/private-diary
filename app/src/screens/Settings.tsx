import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import { LOCK_CHOICES, THEME_CHOICES, formatTime, type Settings } from '../settings/settings';
import { LANG_CHOICES } from '../i18n/i18n';
import type { ReminderStatus } from '../settings/reminder';
import type { ImportFailure } from '../import/importer';

export type ExportKind = 'md' | 'json' | 'txt' | 'docx' | 'pdf';

export type ImportPreview =
  | { status: 'cancelled' }
  | { status: 'error' }
  | { status: 'invalid'; reason: ImportFailure }
  | { status: 'ready'; total: number; fresh: number; invalid: number };

type Props = {
  settings: Settings;
  reminderStatus: ReminderStatus;
  onChange: (next: Settings) => void;
  onBack: () => void;
  onActivity: () => void;
  /** Resolves 'shared', 'unavailable' or 'error'. */
  onExport: (kind: ExportKind) => Promise<'shared' | 'unavailable' | 'error'>;
  /** Lets the person choose a JSON export and says what is in it. Nothing is stored yet. */
  onPreviewImport: () => Promise<ImportPreview>;
  /** Stores the previewed entries (all or nothing) and returns how many were added. Throws on failure. */
  onConfirmImport: () => Promise<number>;
  onCancelImport: () => void;
  /** Wipes everything and returns to first-time setup. Throws if the wipe failed. */
  onDeleteAll: () => Promise<void>;
};


export default function Settings({ settings, reminderStatus, onChange, onBack, onActivity, onExport, onPreviewImport, onConfirmImport, onCancelImport, onDeleteAll }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const LOCK_LABEL: Record<number, string> = { 0: t('Immediately'), 1: t('1 min'), 5: t('5 min'), 15: t('15 min') };
  const THEME_LABEL = { system: t('System'), dark: t('Dark'), light: t('Light') } as const;
  const LANG_LABEL = { system: t('Device'), en: t('English'), de: t('Deutsch') } as const;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const r = settings.reminder;
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);
  const [exportMsg, setExportMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');

  const doExport = async () => {
    if (!exportKind || busy) return;
    setBusy(true);
    setExportMsg('');
    const res = await onExport(exportKind);
    setBusy(false);
    setExportKind(null);
    setExportMsg(res === 'shared' ? t('Export finished.') : res === 'unavailable' ? t('Sharing is not available on this device.') : t('The export failed. Nothing was changed.'));
  };

  const [preview, setPreview] = useState<Extract<ImportPreview, { status: 'ready' }> | null>(null);
  const [importMsg, setImportMsg] = useState('');

  const failText = (r: ImportFailure) =>
    r === 'wrong-app' ? t('This is not an export this app can read.') : r === 'wrong-csv' ? t('This CSV file is not a Daylio export.') : r === 'wrong-format' ? t('This file is from a different version of the export format.') : r === 'no-entries' ? t('The file does not contain a list of entries.') : r === 'not-json' ? t('The file is not valid JSON.') : t('The file is too big or has too many entries.');

  const doPickImport = async () => {
    if (busy) return;
    setBusy(true);
    setImportMsg('');
    setPreview(null);
    onActivity();
    const res = await onPreviewImport();
    setBusy(false);
    if (res.status === 'ready') setPreview(res);
    else if (res.status === 'invalid') setImportMsg(failText(res.reason));
    else if (res.status === 'error') setImportMsg(t('The file could not be opened. Nothing was changed.'));
  };

  const doConfirmImport = async () => {
    if (busy || !preview) return;
    setBusy(true);
    try {
      const n = await onConfirmImport();
      setPreview(null);
      setImportMsg(n === 1 ? t('Imported {n} entry. The file itself is not encrypted: delete it when you no longer need it.', { n }) : t('Imported {n} entries. The file itself is not encrypted: delete it when you no longer need it.', { n }));
    } catch {
      setPreview(null);
      setImportMsg(t('The import failed. Nothing was added.'));
    }
    setBusy(false);
  };

  const doDelete = async () => {
    if (confirmText !== 'DELETE' || busy) return;
    setBusy(true);
    setDeleteMsg('');
    try {
      await onDeleteAll();
    } catch {
      setBusy(false);
      setDeleteMsg(t('Deleting failed. Nothing was removed, your diary is unchanged.'));
    }
  };

  const change = (next: Settings) => {
    onActivity();
    onChange(next);
  };
  const setReminder = (patch: Partial<Settings['reminder']>) => change({ ...settings, reminder: { ...r, ...patch } });

  const stepHour = (d: number) => setReminder({ hour: (r.hour + d + 24) % 24 });
  const stepMinute = (d: number) => setReminder({ minute: (r.minute + d + 60) % 60 });

  const seg = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={on}
      onPress={onPress}
      style={[styles.seg, on && styles.segOn]}
    >
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back to calendar')} onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>{t('‹ Back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('Settings')}</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text accessibilityRole="header" style={styles.heading}>{t('Auto-lock')}</Text>
        <Text style={styles.help}>{t('Lock the diary after this much time without use, and when you come back to the app after being away that long.')}</Text>
        <View style={styles.segRow}>{LOCK_CHOICES.map((m) => seg(LOCK_LABEL[m], settings.lockMinutes === m, () => change({ ...settings, lockMinutes: m })))}</View>

        {Platform.OS === 'web' ? (
          <>
            <Text accessibilityRole="header" style={styles.heading}>{t('Daily reminder')}</Text>
            <Text style={styles.help}>{t('The web version cannot send reminders. Set a daily alarm in the Clock or Reminders app on your phone instead.')}</Text>
          </>
        ) : (
          <>
        <Text accessibilityRole="header" style={styles.heading}>{t('Daily reminder')}</Text>
        <Text style={styles.help}>{t('A quiet notification that does not mention your diary, so the lock screen reveals nothing.')}</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={t('Daily reminder')}
          aria-checked={r.enabled}
          onPress={() => setReminder({ enabled: !r.enabled })}
          style={styles.switchRow}
        >
          <Text style={styles.switchText}>{r.enabled ? t('On') : t('Off')}</Text>
          <View style={[styles.track, r.enabled && styles.trackOn]}>
            <View style={[styles.knob, r.enabled && styles.knobOn]} />
          </View>
        </Pressable>
        {r.enabled && (
          <View style={styles.timeRow}>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Earlier hour')} onPress={() => stepHour(-1)} style={styles.stepBtn}><Text style={styles.stepText}>−</Text></Pressable>
              <Text style={styles.time} accessibilityLabel={t('Reminder time {time}', { time: formatTime(r.hour, r.minute) })}>{formatTime(r.hour, r.minute)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Later hour')} onPress={() => stepHour(1)} style={styles.stepBtn}><Text style={styles.stepText}>+</Text></Pressable>
            </View>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Earlier minutes')} onPress={() => stepMinute(-5)} style={styles.stepBtn}><Text style={styles.stepText}>−5</Text></Pressable>
              <Text style={styles.timeSmall}>{t('minutes')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Later minutes')} onPress={() => stepMinute(5)} style={styles.stepBtn}><Text style={styles.stepText}>+5</Text></Pressable>
            </View>
          </View>
        )}
        {r.enabled && reminderStatus === 'denied' && (
          <Text style={styles.warn}>{t('Notifications are turned off for this app. Allow them in the iPhone Settings app to get the reminder.')}</Text>
        )}
        {r.enabled && reminderStatus === 'unsupported' && <Text style={styles.warn}>{t('Reminders are not available here.')}</Text>}

          </>
        )}

        {Platform.OS === 'web' && (
          <>
            <Text accessibilityRole="header" style={styles.heading}>{t('About this web version')}</Text>
            <Text style={styles.help}>{t('Your diary is stored in this browser on this device and protected only by your passcode. Use a passphrase, export a JSON backup now and then, and do not clear this site\'s data.')}</Text>
          </>
        )}

        <Text accessibilityRole="header" style={styles.heading}>{t('Theme')}</Text>
        <View style={styles.segRow}>{THEME_CHOICES.map((c) => seg(THEME_LABEL[c], settings.theme === c, () => change({ ...settings, theme: c })))}</View>

        <Text accessibilityRole="header" style={styles.heading}>{t('Language')}</Text>
        <Text style={styles.help}>{t('Changes the text of the app. Your entries are never translated.')}</Text>
        <View style={styles.segRow}>{LANG_CHOICES.map((c) => seg(LANG_LABEL[c], settings.language === c, () => change({ ...settings, language: c })))}</View>

        <Text accessibilityRole="header" style={styles.heading}>{t('Your data')}</Text>
        <Text style={styles.help}>{t('Export your entries as one readable file. Entries in the trash are not included.')} {t('Photos and locations stay in the app and are not part of exports.')}</Text>
        <View style={styles.segRow}>
          {seg(t('Export as Markdown'), exportKind === 'md', () => { setExportMsg(''); setExportKind('md'); })}
          {seg(t('Export as JSON'), exportKind === 'json', () => { setExportMsg(''); setExportKind('json'); })}
          {seg(t('Export as plain text'), exportKind === 'txt', () => { setExportMsg(''); setExportKind('txt'); })}
          {seg(t('Export as Word'), exportKind === 'docx', () => { setExportMsg(''); setExportKind('docx'); })}
          {seg(t('Export as PDF'), exportKind === 'pdf', () => { setExportMsg(''); setExportKind('pdf'); })}
        </View>
        {exportKind && (
          <View style={styles.panel}>
            <Text style={styles.panelText}>{t('This file is not encrypted. Anyone who gets it can read your entries. Keep it somewhere safe.')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Export unencrypted file')} onPress={() => void doExport()} disabled={busy} style={[styles.action, busy && styles.disabled]}>
              <Text style={styles.actionText}>{busy ? t('Exporting…') : t('Export unencrypted file')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel export')} onPress={() => setExportKind(null)} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t('Cancel')}</Text>
            </Pressable>
          </View>
        )}
        <View accessibilityLiveRegion="polite">{exportMsg !== '' && <Text style={styles.warn}>{exportMsg}</Text>}</View>

        <Text style={styles.help}>{t('Bring entries back from a JSON export of this app, a Daylio CSV or a Day One JSON file. Entries that are already here are skipped and never overwritten.')}</Text>
        <View style={styles.segRow}>{seg(t('Import from a file'), preview !== null, () => void doPickImport())}</View>
        {preview && (
          <View style={styles.panel}>
            <Text style={styles.panelText}>
              {preview.fresh === 0
                ? t('Nothing new to import.')
                : preview.total === 1
                  ? t('Found {n} entry, {m} of them new.', { n: preview.total, m: preview.fresh })
                  : t('Found {n} entries, {m} of them new.', { n: preview.total, m: preview.fresh })}
              {preview.invalid > 0 ? ' ' + t('Entries that could not be read and will be skipped: {k}.', { k: preview.invalid }) : ''}
            </Text>
            {preview.fresh > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel={preview.fresh === 1 ? t('Import {m} entry', { m: 1 }) : t('Import {m} entries', { m: preview.fresh })} onPress={() => void doConfirmImport()} disabled={busy} style={[styles.action, busy && styles.disabled]}>
                <Text style={styles.actionText}>{busy ? t('Importing…') : preview.fresh === 1 ? t('Import {m} entry', { m: 1 }) : t('Import {m} entries', { m: preview.fresh })}</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel import')} onPress={() => { onCancelImport(); setPreview(null); }} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t('Cancel')}</Text>
            </Pressable>
          </View>
        )}
        <View accessibilityLiveRegion="polite">{importMsg !== '' && <Text style={styles.warn}>{importMsg}</Text>}</View>

        <Text accessibilityRole="header" style={styles.heading}>{t('Delete all data')}</Text>
        <Text style={styles.help}>{t('Removes every entry (also in the trash), your passcode, recovery key and settings from this phone.')}</Text>
        {!deleting ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Delete all data')} onPress={() => setDeleting(true)} style={styles.dangerOutline}>
            <Text style={styles.dangerText}>{t('Delete all data…')}</Text>
          </Pressable>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelText}>{t('This cannot be undone. Without an export, your entries are gone for good. Type DELETE to confirm.')}</Text>
            <TextInput
              accessibilityLabel={t('Type DELETE to confirm')}
              placeholder="DELETE"
              placeholderTextColor={colors.textFaint}
              value={confirmText}
              onChangeText={(v) => { onActivity(); setConfirmText(v); }}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.confirmInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Delete everything')}
              aria-disabled={confirmText !== 'DELETE' || busy}
              disabled={confirmText !== 'DELETE' || busy}
              onPress={() => void doDelete()}
              style={[styles.dangerBtn, (confirmText !== 'DELETE' || busy) && styles.disabled]}
            >
              <Text style={styles.dangerBtnText}>{busy ? t('Deleting…') : t('Delete everything')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel delete')} onPress={() => { setDeleting(false); setConfirmText(''); setDeleteMsg(''); }} style={styles.linkBtn}>
              <Text style={styles.linkText}>{t('Cancel')}</Text>
            </Pressable>
            <View accessibilityLiveRegion="polite">{deleteMsg !== '' && <Text style={styles.warn}>{deleteMsg}</Text>}</View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
    back: { width: 64, height: 48, justifyContent: 'center' },
    backText: { color: colors.textDim, fontSize: 15, fontFamily: fonts.sansMedium },
    title: { fontSize: 20, color: colors.text, fontFamily: fonts.sansBold },
    body: { padding: 20, paddingBottom: 48 },
    heading: { fontSize: 16, color: colors.text, marginTop: 24, fontFamily: fonts.sansBold },
    help: { fontSize: 13, lineHeight: 19, color: colors.textDim, marginTop: 4, marginBottom: 10, fontFamily: fonts.sans },
    segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    seg: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.outline, justifyContent: 'center' },
    segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    segText: { color: colors.text, fontSize: 14, fontFamily: fonts.sansMedium },
    segTextOn: { color: colors.accentText, fontFamily: fonts.sansBold },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
    switchText: { color: colors.text, fontSize: 15, fontFamily: fonts.sansMedium },
    track: { width: 52, height: 30, borderRadius: 15, backgroundColor: colors.outline, padding: 3 },
    trackOn: { backgroundColor: colors.accent },
    knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card },
    knobOn: { marginLeft: 22 },
    timeRow: { marginTop: 12, gap: 10 },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
    stepBtn: { width: 64, height: 48, alignItems: 'center', justifyContent: 'center' },
    stepText: { color: colors.text, fontSize: 18, fontFamily: fonts.sansBold },
    time: { color: colors.text, fontSize: 22, fontFamily: fonts.sansBold },
    timeSmall: { color: colors.textDim, fontSize: 14, fontFamily: fonts.sans },
    panel: { marginTop: 12, padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, gap: 10 },
    panelText: { color: colors.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.sans },
    action: { height: 48, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: colors.accentText, fontSize: 14, fontFamily: fonts.sansBold },
    linkBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: colors.textDim, fontSize: 14, fontFamily: fonts.sansMedium },
    dangerOutline: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.stop, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: colors.stop, fontSize: 14, fontFamily: fonts.sansBold },
    dangerBtn: { height: 48, borderRadius: 14, backgroundColor: colors.stop, alignItems: 'center', justifyContent: 'center' },
    dangerBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.sansBold },
    confirmInput: { height: 48, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 16, fontFamily: fonts.sansMedium },
    disabled: { opacity: 0.4 },
    warn: { marginTop: 10, color: colors.textDim, fontSize: 13, lineHeight: 19, fontFamily: fonts.sans },
  });
