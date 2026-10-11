import './src/crypto/setup';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Sora_400Regular, Sora_500Medium, Sora_600SemiBold } from '@expo-google-fonts/sora';
import { Newsreader_400Regular, Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import VaultFlow from './src/screens/VaultFlow';
import Calendar from './src/screens/Calendar';
import Review from './src/screens/Review';
import Trash from './src/screens/Trash';
import Search from './src/screens/Search';
import { fonts } from './src/theme';
import { useTheme, ThemeProvider } from './src/themeContext';
import { I18nProvider, useI18n } from './src/i18nContext';
import { deviceLocale, resolveLang, makeT, type TFn } from './src/i18n/i18n';
import { REMINDER_TEXT } from './src/settings/reminder';
import { darkPalette, type Palette } from './src/palettes';
import Insights from './src/screens/Insights';
import Settings, { type ImportPreview } from './src/screens/Settings';
import { DEFAULT_SETTINGS, SettingsService, idleLimitMs, type Settings as SettingsData } from './src/settings/settings';
import { applyReminder, type ReminderStatus } from './src/settings/reminder';
import { expoNotifier } from './src/settings/notifier';
import type { ExportKind } from './src/screens/Settings';
import { exportDocx, exportFileName, exportHtml, exportJson, exportMarkdown, exportText } from './src/export/exporters';
import { pickTextFile } from './src/import/pickFile';
import { groupByDay } from './src/calendar/dayEntries';
import type { ImportItem } from './src/import/importer';
import { photoDataUri, storePickedPhoto } from './src/photos/photoActions';
import { pickPhoto } from './src/photos/pickPhoto';
import { getPlace } from './src/place/getPlace';
import { parseAnyImport } from './src/import/others';
import { shareHtmlAsPdf, shareTextFile } from './src/export/shareFile';
import { wipeAll } from './src/data/wipe';
import { disableBiometric } from './src/vault/biometric';
import { VaultService } from './src/vault/vaultService';
import { secureStore } from './src/vault/secureStore';
import { shouldLockOnIdle, shouldLockOnReturn } from './src/vault/autoLock';
import { EditorSession } from './src/editor/editorSession';
import { openExpoDb } from './src/storage/expoDb';
import type { Db } from './src/storage/db';
import { EntryRepository, eraseOldDiary, needsRestore, peekRecoveryBlob, prepareSchema, saveRecoveryBlob, type StoredEntry } from './src/storage/entryRepository';
import { canGoNext, dayKey, parseDay, monthKey, nextMonth, prevMonth, streak, todayOf, MONTH_NAMES, weekdayName, type YM, type YMD } from './src/calendar/calendarMath';
import type { Entries, Entry, Screen } from './src/types';

const dateLabel = (t: TFn, d: YMD, today: YMD) =>
  d.year === today.year && d.month === today.month && d.day === today.day
    ? t('Today')
    : d.year === today.year
      ? t('{weekday} {day} {month}', { weekday: t(weekdayName(d)), day: d.day, month: t(MONTH_NAMES[d.month - 1]) })
      : t('{weekday} {day} {month} {year}', { weekday: t(weekdayName(d)), day: d.day, month: t(MONTH_NAMES[d.month - 1]), year: d.year });

type Editing = { session: EditorSession; initial: Entry; date: YMD; from: 'calendar' | 'search'; dictate: boolean; selfId: string | null; others: StoredEntry[] };

type InnerProps = {
  settings: SettingsData;
  reminderStatus: ReminderStatus;
  onSettings: (next: SettingsData) => void;
  settingsService: SettingsService;
  /** Settings were deleted from storage: reset the in-memory copy without saving it again. */
  onWiped: () => void;
};

function AppInner({ settings, reminderStatus, onSettings, settingsService, onWiped }: InnerProps) {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // The lock rules read the limit from a ref so changing the setting does not re-subscribe anything.
  const idleLimit = useRef(idleLimitMs(settings));
  idleLimit.current = idleLimitMs(settings);
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Newsreader_400Regular,
    Newsreader_500Medium,
  });

  const vault = useMemo(() => new VaultService(secureStore), []);

  // The data key exists only in memory and only while unlocked. Locking drops it.
  const [dataKey, setDataKey] = useState<Uint8Array | null>(null);
  const pendingImport = useRef<ImportItem[] | null>(null);
  const [unlockMs, setUnlockMs] = useState<number | null>(null);
  const [screen, setScreen] = useState<Screen>('calendar');
  const [stored, setStored] = useState<StoredEntry[]>([]);
  const [repo, setRepo] = useState<EntryRepository | null>(null);
  const dbRef = useRef<Db | null>(null);
  // New phone: entries came along but the keychain did not. Looked up whenever the diary is locked.
  const [restoreBlob, setRestoreBlob] = useState<string | null>(null);
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [today, setToday] = useState<YMD>(() => todayOf(new Date()));
  const [view, setView] = useState<YM>(() => {
    const t = todayOf(new Date());
    return { year: t.year, month: t.month };
  });
  const [searchItems, setSearchItems] = useState<StoredEntry[]>([]);
  const [trashItems, setTrashItems] = useState<StoredEntry[]>([]);
  const [writtenDays, setWrittenDays] = useState<string[]>([]);
  const [covered, setCovered] = useState(false);

  const lastActive = useRef(Date.now());
  const backgroundedAt = useRef<number | null>(null);
  const unlocked = dataKey !== null;

  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;

  // Locking first stores whatever is being typed, then drops the key.
  const lock = useCallback(async () => {
    pendingImport.current = null; // plaintext of a chosen import file must not outlive the unlocked session
    try {
      await editingRef.current?.session.flush();
    } catch {
      // nothing more we can do; never log content
    }
    setEditing(null);
    setDataKey(null);
    setRepo(null);
    setStored([]);
    setSearchItems([]);
    setTrashItems([]);
    setScreen('calendar');
  }, []);

  // hooks must stay above the early return for fonts
  const loadThrowbacks = useCallback(async (month: number, day: number, beforeYear: number) => (repo ? repo.listOnDay(month, day, beforeYear) : []), [repo]);

  const loadPhoto = useCallback((id: string) => (repo ? photoDataUri(repo, id) : Promise.resolve(null)), [repo]);

  const touch = useCallback(() => {
    lastActive.current = Date.now();
  }, []);

  // While unlocked: open the encrypted database and load the month. Locking closes it again.
  useEffect(() => {
    if (!dataKey) return;
    let cancelled = false;
    let db: Db | null = null;
    (async () => {
      try {
        db = await openExpoDb();
        dbRef.current = db;
        await prepareSchema(db);
        // Encrypted copy of the recovery material, kept next to the data for restoring on a new phone (step 1.6).
        await saveRecoveryBlob(db, await vault.getRecoveryBlob());
        const r = new EntryRepository(db, dataKey);
        await r.purgeExpired(); // entries trashed 30 days ago or more are removed for good
        await r.purgeUnlinkedPhotos(); // photos picked but never saved with an entry
        if (cancelled) return;
        setRepo(r);
      } catch {
        if (!cancelled) setStorageError(true); // never log entry content
      }
    })();
    return () => {
      cancelled = true;
      setRepo(null);
      dbRef.current = null;
      db?.close().catch(() => {});
    };
  }, [dataKey, vault]);

  useEffect(() => {
    if (dataKey) return;
    let alive = true;
    (async () => {
      let blob: string | null = null;
      try {
        const db = await openExpoDb();
        try {
          blob = await peekRecoveryBlob(db);
        } finally {
          await db.close();
        }
        if (!needsRestore(await vault.isSetUp(), blob)) blob = null;
      } catch {
        blob = null; // no readable database: behave like a fresh install
      }
      if (alive) {
        setRestoreBlob(blob);
        setRestoreChecked(true);
      }
    })();
    return () => {
      alive = false;
      setRestoreChecked(false);
    };
  }, [dataKey, vault]);

  const eraseOld = async () => {
    const db = await openExpoDb();
    try {
      await eraseOldDiary(db);
    } finally {
      await db.close();
    }
    setRestoreBlob(null);
  };

  // Reload the viewed month (and the days used for the streak) whenever the storage or month changes.
  const refresh = useCallback(async () => {
    if (!repo) return;
    const [list, days] = await Promise.all([repo.listMonth(monthKey(view)), repo.listDays()]);
    setStored(list);
    setWrittenDays(days);
  }, [repo, view]);

  useEffect(() => {
    refresh().catch(() => setStorageError(true));
  }, [refresh]);

  const byDay = useMemo(() => groupByDay(stored), [stored]);

  const entries = useMemo<Entries>(() => {
    const out: Entries = {};
    for (const [d, list] of Object.entries(byDay)) out[Number(d)] = list[0].entry;
    return out;
  }, [byDay]);

  // Leaving the app and coming back: lock if it was away for the limit or longer.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setCovered(next !== 'active');
      if (next === 'active') setToday(todayOf(new Date())); // the date may have changed while away
      if (next !== 'active') void editingRef.current?.session.flush(); // iOS may suspend us right after
      if (next === 'background') {
        backgroundedAt.current = Date.now();
        if (idleLimit.current <= 0) void lock();
      } else if (next === 'active') {
        const at = backgroundedAt.current;
        backgroundedAt.current = null;
        if (at !== null && shouldLockOnReturn(at, Date.now(), idleLimit.current)) void lock();
        lastActive.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [lock]);

  // App open but untouched: lock when idle for the limit.
  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => {
      if (shouldLockOnIdle(lastActive.current, Date.now(), idleLimit.current)) void lock();
    }, 5000);
    return () => clearInterval(id);
  }, [unlocked, lock]);

  if (!fontsLoaded) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const startEditing = (date: YMD, existing: StoredEntry | null, from: 'calendar' | 'search', dictate = false) => {
    if (!repo) return;
    const initial: Entry = existing ? existing.entry : { mood: 3, title: '', text: '', tags: [] };
    const session = new EditorSession(repo, dayKey(date), existing);
    setEditing({ session, initial, date, from, dictate, selfId: existing?.id ?? null, others: [] });
    setScreen('review');
    // other entries for [[links]] and "Linked from", loaded after the editor is already open
    repo.listAll().then(
      (items) => setEditing((e) => (e && e.session === session ? { ...e, others: items } : e)),
      () => {},
    );
  };

  const openLinked = async (item: StoredEntry) => {
    const from = editing?.from ?? 'calendar';
    await closeEditor(false);
    startEditing(parseDay(item.day), item, from === 'search' ? 'calendar' : from);
  };

  const openEditor = (day: number, dictate = false, another = false) => {
    const date: YMD = { ...view, day };
    startEditing(date, another ? null : byDay[day]?.[0] ?? null, 'calendar', dictate);
  };

  const openSearch = async () => {
    if (!repo) return;
    try {
      setSearchItems(await repo.listAll());
      setScreen('search');
    } catch {
      setStorageError(true);
    }
  };

  const openFromSearch = (item: StoredEntry) => {
    const d = parseDay(item.day);
    setStored([]); // the calendar month changes to the entry's month and reloads
    setView({ year: d.year, month: d.month });
    startEditing(d, item, 'search');
  };

  // After editing, go back to where the entry was opened from. Coming from search, reload the list first.
  const leaveEditor = async () => {
    const from = editing?.from ?? 'calendar';
    setEditing(null);
    if (from === 'search' && repo) {
      try {
        setSearchItems(await repo.listAll());
        setScreen('search');
        return;
      } catch {
        setStorageError(true);
      }
    }
    setScreen('calendar');
  };

  const trashEditor = async () => {
    if (!repo || !editing) return;
    try {
      await editing.session.moveToTrash();
      await refresh();
    } catch {
      setStorageError(true);
    }
    await leaveEditor();
  };

  const previewImport = async (): Promise<ImportPreview> => {
    pendingImport.current = null;
    if (!repo) return { status: 'error' };
    try {
      const text = await pickTextFile();
      if (text === null) return { status: 'cancelled' };
      const res = parseAnyImport(text);
      if (!res.ok) return { status: 'invalid', reason: res.reason };
      const fresh = await repo.newIds(res.items.map((i) => i.id));
      pendingImport.current = res.items;
      return { status: 'ready', total: res.items.length, fresh: fresh.length, invalid: res.invalid };
    } catch {
      return { status: 'error' }; // never log content
    }
  };

  const confirmImport = async (): Promise<number> => {
    const items = pendingImport.current;
    if (!repo || !items) throw new Error('nothing to import');
    const r = await repo.importEntries(items);
    pendingImport.current = null;
    await refresh();
    return r.added;
  };

  const cancelImport = () => {
    pendingImport.current = null;
  };

  const exportData = async (kind: ExportKind): Promise<'shared' | 'unavailable' | 'error'> => {
    if (!repo) return 'error';
    try {
      const items = await repo.listAll();
      const now = new Date();
      const name = exportFileName(kind, now);
      if (kind === 'pdf') return await shareHtmlAsPdf(name, exportHtml(items, now, t, lang));
      if (kind === 'docx') return await shareTextFile(name, exportDocx(items, now, t), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      if (kind === 'txt') return await shareTextFile(name, exportText(items, now, t), 'text/plain');
      if (kind === 'json') return await shareTextFile(name, exportJson(items, now), 'application/json');
      return await shareTextFile(name, exportMarkdown(items, now, t), 'text/markdown');
    } catch {
      return 'error'; // never log content
    }
  };

  const deleteAll = async () => {
    const db = dbRef.current;
    if (!db) throw new Error('storage is not open');
    await wipeAll({ db, vault, settings: settingsService, disableBiometric });
    onWiped();
    await lock(); // the vault is no longer set up, so the app shows first-time setup
  };

  const openInsights = async () => {
    if (!repo) return;
    try {
      setSearchItems(await repo.listAll());
      setScreen('insights');
    } catch {
      setStorageError(true);
    }
  };

  const openTrash = async () => {
    if (!repo) return;
    try {
      setTrashItems(await repo.listTrash());
      setScreen('trash');
    } catch {
      setStorageError(true);
    }
  };

  const trashAction = async (fn: (r: EntryRepository) => Promise<void>) => {
    if (!repo) return;
    try {
      await fn(repo);
      setTrashItems(await repo.listTrash());
      await refresh();
    } catch {
      setStorageError(true);
    }
  };

  const closeEditor = async (discard: boolean) => {
    if (!repo || !editing) return;
    try {
      if (discard) await editing.session.discard();
      else await editing.session.finish();
      await refresh();
    } catch {
      setStorageError(true);
    }
    await leaveEditor();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.fill} onTouchStart={touch}>
          <StatusBar style={colors.statusBar} />

          {!unlocked && !restoreChecked && (
            <View style={[styles.fill, styles.center]}>
              <ActivityIndicator color={colors.accent} />
            </View>
          )}
          {!unlocked && restoreChecked && (
            <VaultFlow
              vault={vault}
              restoreBlob={restoreBlob}
              onEraseOld={eraseOld}
              onUnlocked={(key, ms) => {
                lastActive.current = Date.now();
                setUnlockMs(ms);
                const t = todayOf(new Date());
                setToday(t);
                setView({ year: t.year, month: t.month });
                setScreen('calendar');
                setDataKey(key);
              }}
            />
          )}

          {unlocked && !repo && (
            <View style={[styles.fill, styles.center]}>
              {storageError ? <Text style={styles.err}>{t('Could not open the diary storage. Lock and try again.')}</Text> : <ActivityIndicator color={colors.accent} />}
            </View>
          )}

          {unlocked && repo && screen === 'calendar' && (
            <Calendar
              key={monthKey(view)}
              view={view}
              today={today}
              entries={entries}
              dayEntries={byDay}
              streakDays={streak(writtenDays, today)}
              canNext={canGoNext(view, today)}
              onPrev={() => {
                setStored([]);
                setView(prevMonth(view));
              }}
              onNext={() => {
                setStored([]);
                setView(nextMonth(view));
              }}
              unlockMs={unlockMs}
              onLock={() => void lock()}
              onOpenTrash={() => void openTrash()}
              onOpenInsights={() => void openInsights()}
              onOpenSearch={() => void openSearch()}
              onOpenSettings={() => setScreen('settings')}
              onDictate={(day) => openEditor(day, true)}
              loadThrowbacks={loadThrowbacks}
              onOpenEntry={(it) => startEditing(parseDay(it.day), it, 'calendar')}
              onWrite={(day) => openEditor(day)}
              onWriteAnother={(day) => openEditor(day, false, true)}
            />
          )}
          {unlocked && repo && screen === 'settings' && (
            <Settings settings={settings} reminderStatus={reminderStatus} onChange={onSettings} onBack={() => setScreen('calendar')} onActivity={touch} onExport={exportData} onPreviewImport={previewImport} onConfirmImport={confirmImport} onCancelImport={cancelImport} onDeleteAll={deleteAll} />
          )}
          {unlocked && repo && screen === 'search' && (
            <Search
              items={searchItems}
              onBack={() => {
                setSearchItems([]);
                setScreen('calendar');
              }}
              onOpen={openFromSearch}
              onActivity={touch}
              today={today}
            />
          )}
          {unlocked && repo && screen === 'insights' && <Insights items={searchItems} today={today} onBack={() => { setSearchItems([]); setScreen('calendar'); }} />}
          {unlocked && repo && screen === 'trash' && (
            <Trash
              items={trashItems}
              now={Date.now()}
              onBack={() => setScreen('calendar')}
              onRestore={(id) => void trashAction((r) => r.restore(id))}
              onDeleteForever={(id) => void trashAction((r) => r.deletePermanently(id))}
              onEmpty={() => void trashAction((r) => r.emptyTrash())}
            />
          )}
          {unlocked && repo && screen === 'review' && editing && (
            <Review
              key={editing.selfId ?? `new-${editing.session.day}`}
              session={editing.session}
              initial={editing.initial}
              dateLabel={dateLabel(t, editing.date, today)}
              dictate={editing.dictate}
              onActivity={touch}
              onDiscard={() => void closeEditor(true)}
              onDone={() => void closeEditor(false)}
              onTrash={() => void trashEditor()}
              others={editing.others}
              selfId={editing.selfId}
              onOpenLinked={(it) => void openLinked(it)}
              loadPhoto={loadPhoto}
              addPhoto={(n) => storePickedPhoto(repo, pickPhoto, n)}
              findPlace={getPlace}
            />
          )}

          {/* Hides the diary in the app switcher and while the app is not active. */}
          {unlocked && covered && <View style={styles.cover} />}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  err: { color: colors.text, fontFamily: fonts.sans, textAlign: 'center', paddingHorizontal: 32 },
  center: { alignItems: 'center', justifyContent: 'center' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
});

export default function App() {
  const service = useMemo(() => new SettingsService(secureStore), []);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>('off');

  useEffect(() => {
    service.load().then(setSettings, () => setSettings(DEFAULT_SETTINGS));
  }, [service]);

  const r = settings?.reminder;
  const lang = resolveLang(settings?.language ?? 'system', deviceLocale());
  useEffect(() => {
    if (!r) return;
    applyReminder(r, expoNotifier, REMINDER_TEXT[lang]).then(setReminderStatus, () => setReminderStatus('unsupported'));
  }, [r?.enabled, r?.hour, r?.minute, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) return <View style={{ flex: 1, backgroundColor: darkPalette.bg }} />;

  return (
    <ThemeProvider choice={settings.theme}>
      <I18nProvider lang={lang}>
      <AppInner
        settings={settings}
        reminderStatus={reminderStatus}
        settingsService={service}
        onWiped={() => setSettings(DEFAULT_SETTINGS)}
        onSettings={(next) => {
          setSettings(next);
          service.save(next).catch(() => {});
        }}
      />
      </I18nProvider>
    </ThemeProvider>
  );
}
