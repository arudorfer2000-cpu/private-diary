import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PinPad from '../components/PinPad';
import { fonts } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import { VaultService, isWeakPasscode, isValidPin, isValidPasscode, type PasscodeKind, type UnlockResult } from '../vault/vaultService';
import { biometricAvailable, enableBiometric, isBiometricEnabled, unlockWithBiometric } from '../vault/biometric';

type Purpose = 'setup' | 'reset' | 'restore';

type Stage =
  | { name: 'loading' }
  | { name: 'create'; purpose: Purpose; dataKey?: Uint8Array }
  | { name: 'confirm'; purpose: Purpose; dataKey?: Uint8Array; first: string }
  | { name: 'recovery'; recoveryKey: string; dataKey: Uint8Array }
  | { name: 'bio'; dataKey: Uint8Array }
  | { name: 'unlock' }
  | { name: 'recoveryEntry' }
  | { name: 'restoreIntro' }
  | { name: 'restoreKey' }
  | { name: 'restoreErase' };

type Props = {
  vault: VaultService;
  /** Recovery blob found in the database while the keychain has no keys (new phone), or null. */
  restoreBlob: string | null;
  /** Erases the old database content so a new diary can start. */
  onEraseOld: () => Promise<void>;
  onUnlocked: (dataKey: Uint8Array, unlockMs: number | null) => void;
};

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function VaultFlow({ vault, restoreBlob, onEraseOld, onUnlocked }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioTried, setBioTried] = useState(false);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [recoveryText, setRecoveryText] = useState('');
  const [eraseText, setEraseText] = useState('');
  const [kind, setKind] = useState<PasscodeKind>('pin'); // what the unlock screen asks for
  const [createKind, setCreateKind] = useState<PasscodeKind>('pin'); // what the person is choosing now
  const [phrase, setPhrase] = useState('');

  // First look: is the diary set up, is a pause still running, is Face ID on?
  useEffect(() => {
    let alive = true;
    (async () => {
      const setUp = await vault.isSetUp();
      const status = await vault.pauseStatus();
      const bio = setUp ? await isBiometricEnabled() : false;
      const k = setUp ? await vault.getPasscodeKind() : 'pin';
      if (!alive) return;
      setKind(k);
      setBioEnabled(bio);
      if (status.blocked) setPausedUntil(Date.now() + status.retryInMs);
      setStage(setUp ? { name: 'unlock' } : restoreBlob ? { name: 'restoreIntro' } : { name: 'create', purpose: 'setup' });
    })();
    return () => {
      alive = false;
    };
  }, [vault, restoreBlob]);

  // Countdown while paused
  useEffect(() => {
    if (pausedUntil === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= pausedUntil) {
        setPausedUntil(null);
        setMessage('');
      }
    }, 500);
    return () => clearInterval(id);
  }, [pausedUntil]);

  const remaining = pausedUntil !== null ? Math.max(0, pausedUntil - now) : 0;
  const paused = remaining > 0;

  const startPause = (retryInMs: number) => {
    setNow(Date.now());
    setPausedUntil(Date.now() + retryInMs);
  };

  const report = (r: Exclude<UnlockResult, { ok: true }>, what: string) => {
    if (r.reason === 'paused') {
      startPause(r.retryInMs);
      setMessage(t('Too many wrong tries.'));
    } else if (r.retryInMs > 0) {
      startPause(r.retryInMs);
      setMessage(t('Wrong {what}. Too many wrong tries.', { what }));
    } else {
      setMessage(r.triesLeft === 1 ? t('Wrong {what}. {n} try left before a pause.', { what, n: r.triesLeft }) : t('Wrong {what}. {n} tries left before a pause.', { what, n: r.triesLeft }));
    }
  };

  // ---- actions ----

  const onUnlockPin = async (pin: string) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await vault.unlock(pin);
      if (r.ok) onUnlocked(r.dataKey, r.ms);
      else report(r, t('passcode'));
    } catch {
      setMessage(t('The stored keys could not be read. Use your recovery key.'));
    } finally {
      setBusy(false);
    }
  };

  const onUnlockPhrase = () => {
    const v = phrase;
    setPhrase('');
    void onUnlockPin(v);
  };

  const onCreatePhrase = () => {
    if (stage.name !== 'create') return;
    if (isWeakPasscode(phrase)) {
      setMessage(t('Too easy to guess. Use at least 10 characters, with several different words or characters, and no repeats.'));
      return;
    }
    const first = phrase;
    setPhrase('');
    onCreatePin(first);
  };

  const onConfirmPhrase = () => {
    const v = phrase;
    setPhrase('');
    void onConfirmPin(v);
  };

  const switchCreateKind = (k: PasscodeKind) => {
    setPhrase('');
    setMessage('');
    setCreateKind(k);
  };

  const onCreatePin = (pin: string) => {
    if (stage.name !== 'create') return;
    if (isWeakPasscode(pin)) {
      setMessage(t('Too easy to guess. Avoid repeats like 111111 and runs like 123456.'));
      return;
    }
    setMessage('');
    setStage({ name: 'confirm', purpose: stage.purpose, dataKey: stage.dataKey, first: pin });
  };

  const onConfirmPin = async (pin: string) => {
    if (stage.name !== 'confirm' || busy) return;
    if (pin !== stage.first) {
      setMessage(t('The two passcodes did not match. Start again.'));
      setStage({ name: 'create', purpose: stage.purpose, dataKey: stage.dataKey });
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (stage.purpose === 'setup') {
        const { dataKey, recoveryKey } = await vault.setup(pin);
        setStage({ name: 'recovery', recoveryKey, dataKey });
      } else if (stage.purpose === 'restore' && stage.dataKey && restoreBlob) {
        await vault.finishRestore(restoreBlob, stage.dataKey, pin);
        onUnlocked(stage.dataKey, null);
      } else if (stage.dataKey) {
        await vault.setNewPasscode(stage.dataKey, pin);
        onUnlocked(stage.dataKey, null);
      }
    } catch {
      setMessage(t('Could not save the passcode. Please try again.'));
      setStage({ name: 'create', purpose: stage.purpose, dataKey: stage.dataKey });
    } finally {
      setBusy(false);
    }
  };

  const onRecoverySaved = async () => {
    if (stage.name !== 'recovery') return;
    const dataKey = stage.dataKey;
    if (await biometricAvailable()) setStage({ name: 'bio', dataKey });
    else onUnlocked(dataKey, null);
  };

  const onEnableBio = async () => {
    if (stage.name !== 'bio') return;
    const ok = await enableBiometric(stage.dataKey);
    setBioEnabled(ok);
    if (ok) onUnlocked(stage.dataKey, null);
    else {
      setBioTried(true);
      setMessage(t('Face ID could not be turned on here (Expo Go may not support it). Your passcode still works.'));
    }
  };

  const onBioUnlock = async () => {
    const key = await unlockWithBiometric(t('Unlock your diary'));
    if (key) onUnlocked(key, null);
    else setMessage(t('Face ID did not work. Use your passcode.'));
  };

  const onRecoveryEntry = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await vault.unlockWithRecovery(recoveryText);
      if (r.ok) {
        setRecoveryText('');
        setStage({ name: 'create', purpose: 'reset', dataKey: r.dataKey });
        setMessage(t('Recovery key accepted. Choose a new passcode.'));
      } else report(r, t('recovery key'));
    } catch {
      setMessage(t('The stored keys could not be read.'));
    } finally {
      setBusy(false);
    }
  };

  const onRestoreKey = async () => {
    if (busy || !restoreBlob) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await vault.restoreWithRecovery(restoreBlob, recoveryText);
      if (r.ok) {
        setRecoveryText('');
        setStage({ name: 'create', purpose: 'restore', dataKey: r.dataKey });
        setMessage(t('Recovery key accepted. Choose a passcode for this phone.'));
      } else report(r, t('recovery key'));
    } catch {
      setMessage(t('The saved diary data could not be read.'));
    } finally {
      setBusy(false);
    }
  };

  const onErase = async () => {
    if (busy || eraseText !== 'DELETE') return;
    setBusy(true);
    setMessage('');
    try {
      await onEraseOld();
      setEraseText('');
      setStage({ name: 'create', purpose: 'setup' });
    } catch {
      setMessage(t('Could not erase the old diary. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  };

  // ---- text for the current stage ----

  let title = '';
  let sub = '';
  if (stage.name === 'create') {
    title = stage.purpose === 'setup' ? t('Create your passcode') : t('Choose a new passcode');
    const what = createKind === 'pin' ? t('6 digits') : t('a passphrase of at least 10 characters');
    sub = stage.purpose === 'setup' ? t('Choose {what}. You need it every time you open your diary.', { what }) : stage.purpose === 'restore' ? t('Your diary is back. Pick {what} for this phone.', { what }) : t('Pick {what} for your diary.', { what });
  } else if (stage.name === 'confirm') {
    title = t('Repeat your passcode');
    sub = isValidPin(stage.first) ? t('Enter the same 6 digits once more.') : t('Type the same passphrase once more.');
  } else if (stage.name === 'unlock') {
    title = t('Diary is locked');
    sub = t('Enter your diary passcode. Everything you wrote stays unreadable until you do.');
  } else if (stage.name === 'recoveryEntry') {
    title = t('Use your recovery key');
    sub = t('Type the 52 letters and digits you wrote down. Dashes and spaces do not matter.');
  } else if (stage.name === 'restoreIntro') {
    title = t('Restore your diary');
    sub = t('Entries from an earlier install are on this phone, but the keys do not move between phones. Enter your recovery key to unlock them.');
  } else if (stage.name === 'restoreKey') {
    title = t('Enter your recovery key');
    sub = t('Type the 52 letters and digits you wrote down. Dashes and spaces do not matter.');
  } else if (stage.name === 'restoreErase') {
    title = t('Start a new diary?');
    sub = t('This permanently erases the old entries on this phone. They cannot be opened without the recovery key. Type DELETE to confirm.');
  } else if (stage.name === 'recovery') {
    title = t('Write down your recovery key');
    sub = t('It is the only way back in if you forget your passcode. It is shown once and is not saved anywhere readable.');
  } else if (stage.name === 'bio') {
    title = t('Unlock with Face ID?');
    sub = t('You can still use your passcode. With Face ID on, your phone protects the key instead of the diary passcode.');
  }

  if (stage.name === 'loading') {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const confirmingPhrase = stage.name === 'confirm' && !isValidPin(stage.first);
  const phraseScreen = (stage.name === 'create' && createKind === 'phrase') || confirmingPhrase || (stage.name === 'unlock' && kind === 'phrase');
  const showPad = (stage.name === 'create' || stage.name === 'confirm' || stage.name === 'unlock') && !phraseScreen;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.lockCircle}>
        <Text style={styles.lockGlyph}>🔒</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>

      {stage.name === 'recovery' && (
        <View style={styles.keyBox} accessible accessibilityLabel={t('Recovery key: {key}', { key: stage.recoveryKey.split('-').join(' ') })}>
          {chunk(stage.recoveryKey.split('-'), 4).map((row, i) => (
            <Text key={i} style={styles.keyText}>
              {row.join('-')}
            </Text>
          ))}
        </View>
      )}

      {showPad && (
        <PinPad
          key={stage.name}
          disabled={busy || (stage.name === 'unlock' && paused)}
          onComplete={stage.name === 'create' ? onCreatePin : stage.name === 'confirm' ? onConfirmPin : onUnlockPin}
        />
      )}

      {phraseScreen && (
        <>
          <TextInput
            accessibilityLabel={stage.name === 'confirm' ? t('Repeat passphrase') : t('Passphrase')}
            value={phrase}
            onChangeText={setPhrase}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            textContentType="none"
            editable={!busy && !(stage.name === 'unlock' && paused)}
            onSubmitEditing={stage.name === 'unlock' ? onUnlockPhrase : stage.name === 'confirm' ? onConfirmPhrase : onCreatePhrase}
            placeholder={t('Passphrase')}
            placeholderTextColor={colors.textFaint}
            style={styles.phraseInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stage.name === 'unlock' ? t('Unlock') : stage.name === 'confirm' ? t('Confirm passphrase') : t('Continue')}
            aria-disabled={busy || !isValidPasscode(phrase) || (stage.name === 'unlock' && paused)}
            onPress={stage.name === 'unlock' ? onUnlockPhrase : stage.name === 'confirm' ? onConfirmPhrase : onCreatePhrase}
            disabled={busy || !isValidPasscode(phrase) || (stage.name === 'unlock' && paused)}
            style={[styles.primary, (busy || !isValidPasscode(phrase) || (stage.name === 'unlock' && paused)) && styles.primaryDisabled]}
          >
            <Text style={styles.primaryText}>{stage.name === 'unlock' ? t('Unlock') : stage.name === 'confirm' ? t('Confirm passphrase') : t('Continue')}</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'create' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => switchCreateKind(createKind === 'pin' ? 'phrase' : 'pin')}
          style={styles.link}
        >
          <Text style={styles.linkText}>{createKind === 'pin' ? t('Use a passphrase instead (stronger)') : t('Use 6 digits instead')}</Text>
        </Pressable>
      )}

      {stage.name === 'restoreErase' && (
        <TextInput
          accessibilityLabel={t('Type DELETE to confirm')}
          value={eraseText}
          onChangeText={setEraseText}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
          placeholder="DELETE"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
      )}

      {(stage.name === 'recoveryEntry' || stage.name === 'restoreKey') && (
        <TextInput
          accessibilityLabel={t('Recovery key')}
          value={recoveryText}
          onChangeText={setRecoveryText}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          multiline
          editable={!busy && !paused}
          placeholder="ABCD-EFGH-…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
      )}

      <View style={styles.messageBox} accessibilityLiveRegion="polite">
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>{t('Working… this can take a few seconds')}</Text>
          </View>
        ) : paused ? (
          <Text style={styles.warn}>
            {message ? `${message} ` : ''}{t('Try again in {time}', { time: formatRemaining(remaining) })}
          </Text>
        ) : message ? (
          <Text style={styles.warn}>{message}</Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }} />

      {stage.name === 'recovery' && (
        <Pressable accessibilityRole="button" onPress={onRecoverySaved} style={styles.primary}>
          <Text style={styles.primaryText}>{t('I have written it down')}</Text>
        </Pressable>
      )}

      {stage.name === 'bio' && !bioTried && (
        <>
          <Pressable accessibilityRole="button" onPress={onEnableBio} style={styles.primary}>
            <Text style={styles.primaryText}>{t('Turn on Face ID')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onUnlocked(stage.dataKey, null)} style={styles.link}>
            <Text style={styles.linkText}>{t('Not now')}</Text>
          </Pressable>
        </>
      )}
      {stage.name === 'bio' && bioTried && (
        <Pressable accessibilityRole="button" onPress={() => onUnlocked(stage.dataKey, null)} style={styles.primary}>
          <Text style={styles.primaryText}>{t('Continue')}</Text>
        </Pressable>
      )}

      {stage.name === 'restoreIntro' && (
        <>
          <Pressable accessibilityRole="button" onPress={() => { setMessage(''); setStage({ name: 'restoreKey' }); }} style={styles.primary}>
            <Text style={styles.primaryText}>{t('Enter recovery key')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setMessage(''); setStage({ name: 'restoreErase' }); }} style={styles.link}>
            <Text style={styles.linkText}>{t('Start a new diary instead')}</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'restoreKey' && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Restore diary')}
            onPress={onRestoreKey}
            disabled={busy || paused || recoveryText.trim().length === 0}
            style={[styles.primary, (busy || paused || recoveryText.trim().length === 0) && styles.primaryDisabled]}
          >
            <Text style={styles.primaryText}>{t('Restore diary')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setMessage(''); setStage({ name: 'restoreIntro' }); }} style={styles.link}>
            <Text style={styles.linkText}>{t('Back')}</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'restoreErase' && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Erase old diary')}
            aria-disabled={busy || eraseText !== 'DELETE'}
            onPress={onErase}
            disabled={busy || eraseText !== 'DELETE'}
            style={[styles.primary, (busy || eraseText !== 'DELETE') && styles.primaryDisabled]}
          >
            <Text style={styles.primaryText}>{t('Erase and start new')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setMessage(''); setEraseText(''); setStage({ name: 'restoreIntro' }); }} style={styles.link}>
            <Text style={styles.linkText}>{t('Back')}</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'recoveryEntry' && (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={onRecoveryEntry}
            disabled={busy || paused || recoveryText.trim().length === 0}
            style={[styles.primary, (busy || paused || recoveryText.trim().length === 0) && styles.primaryDisabled]}
          >
            <Text style={styles.primaryText}>{t('Unlock')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMessage('');
              setStage({ name: 'unlock' });
            }}
            style={styles.link}
          >
            <Text style={styles.linkText}>{t('Back to passcode')}</Text>
          </Pressable>
        </>
      )}

      {stage.name === 'unlock' && (
        <>
          {bioEnabled && (
            <Pressable accessibilityRole="button" onPress={onBioUnlock} style={styles.link}>
              <Text style={styles.linkText}>{t('Use Face ID')}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMessage('');
              setStage({ name: 'recoveryEntry' });
            }}
            style={styles.link}
          >
            <Text style={styles.linkText}>{t('Use my recovery key')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, alignItems: 'center', paddingTop: 64, paddingBottom: 28, paddingHorizontal: 28 },
  center: { alignItems: 'center', justifyContent: 'center' },
  lockCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center' },
  lockGlyph: { fontSize: 28 },
  title: { marginTop: 22, marginBottom: 8, fontSize: 24, color: colors.text, textAlign: 'center', fontFamily: fonts.sansMedium },
  sub: { maxWidth: 300, textAlign: 'center', fontSize: 14, lineHeight: 22, color: colors.textDim, fontFamily: fonts.sans },
  keyBox: { marginTop: 24, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', gap: 10 },
  keyText: { fontSize: 17, letterSpacing: 1, color: colors.text, fontFamily: MONO },
  phraseInput: { alignSelf: 'stretch', marginTop: 24, height: 52, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, fontSize: 17, fontFamily: fonts.sans },
  input: { alignSelf: 'stretch', marginTop: 24, minHeight: 96, padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, fontSize: 16, fontFamily: MONO, textAlignVertical: 'top' },
  messageBox: { minHeight: 48, marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  warn: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: '#FFB4A8', fontFamily: fonts.sansMedium },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  busyText: { fontSize: 13, color: colors.textDim, fontFamily: fonts.sans },
  primary: { alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: colors.accentText, fontSize: 15, fontFamily: fonts.sansBold },
  link: { height: 48, paddingHorizontal: 16, justifyContent: 'center' },
  linkText: { color: colors.accent, fontSize: 14, fontFamily: fonts.sansMedium },
});
