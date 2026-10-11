import { useEffect, useState, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, moodColors, moodNames } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import { MAX_TAGS, MAX_TAG_LENGTH, addTag } from '../tags';
import { applyTemplate, templates } from '../templates';
import MarkdownView from '../components/MarkdownView';
import Attachments from '../components/Attachments';
import type { PhotoPick } from '../photos/photoActions';
import type { PlaceResult } from '../place/getPlace';
import { extractLinks, linkedFrom, resolveLink } from '../markdown/markdown';
import type { StoredEntry } from '../storage/entryRepository';
import { MONTH_NAMES, parseDay } from '../calendar/calendarMath';
import type { Entry, Place } from '../types';
import type { EditorSession, SaveStatus } from '../editor/editorSession';

type Props = {
  session: EditorSession;
  initial: Entry;
  dateLabel: string;
  /** Opened with "Dictate": the keyboard comes up straight away. */
  dictate: boolean;
  /** Typing counts as activity, so the diary does not lock while you are writing. */
  onActivity: () => void;
  onDiscard: () => void;
  onDone: () => void;
  onTrash: () => void;
  /** Other entries, for [[links]] and "Linked from". Loaded after the editor opens. */
  others: StoredEntry[];
  /** Id of the entry being edited, or null for a new one. */
  selfId: string | null;
  onOpenLinked: (item: StoredEntry) => void;
  loadPhoto: (id: string) => Promise<string | null>;
  addPhoto: (countAlready: number) => Promise<PhotoPick>;
  findPlace: () => Promise<PlaceResult>;
};


export default function Review({ session, initial, dateLabel, dictate, onActivity, onDiscard, onDone, onTrash, others, selfId, onOpenLinked, loadPhoto, addPhoto, findPlace }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const STATUS_TEXT: Record<SaveStatus, string> = {
    idle: t('Encrypted on this device before it is stored'),
    dirty: t('Saving…'),
    saved: t('Saved and encrypted'),
    error: t('Could not save. Your text is kept; it will retry.'),
  };
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState(initial.title);
  const [text, setText] = useState(initial.text);
  const [mood, setMood] = useState(initial.mood);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [status, setStatus] = useState<SaveStatus>(session.status);
  const [preview, setPreview] = useState(false);
  const [bodyH, setBodyH] = useState(170);
  const [photos, setPhotos] = useState<string[]>(initial.photos ?? []);
  const [place, setPlace] = useState<Place | undefined>(initial.place);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachMsg, setAttachMsg] = useState('');
  const pool = useMemo(() => others.filter((o) => o.id !== selfId), [others, selfId]);
  const linkTargets = useMemo(
    () => extractLinks(text).map((l) => ({ title: l, target: resolveLink(l, pool) })).filter((x): x is { title: string; target: StoredEntry } => x.target !== null),
    [text, pool],
  );
  const backlinks = useMemo(() => linkedFrom(title, pool, selfId), [title, pool, selfId]);
  const shortDay = (day: string) => {
    const d = parseDay(day);
    return t('{day} {month} {year}', { day: d.day, month: t(MONTH_NAMES[d.month - 1]), year: d.year });
  };

  useEffect(() => {
    session.onStatus = setStatus;
    return () => {
      session.onStatus = null;
    };
  }, [session]);

  const edit = (next: Partial<Entry>) => {
    onActivity();
    session.change({ mood, title, text, tags, ...(photos.length ? { photos } : {}), ...(place ? { place } : {}), ...next });
  };

  const commitTag = (raw: string) => {
    const next = addTag(tags, raw);
    setTagDraft('');
    if (next !== tags) {
      setTags(next);
      edit({ tags: next });
    }
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    edit({ tags: next });
  };

  const doAddPhoto = async () => {
    if (attachBusy) return;
    onActivity();
    setAttachBusy(true);
    setAttachMsg('');
    try {
      const r = await addPhoto(photos.length);
      if (r.status === 'ok') {
        const next = [...photos, r.id];
        setPhotos(next);
        edit({ photos: next });
      } else if (r.status === 'limit') setAttachMsg(t('You can attach up to {n} photos.', { n: 10 }));
      else if (r.status === 'too-big') setAttachMsg(t('This photo is too big.'));
      else if (r.status === 'not-image') setAttachMsg(t('That file is not a picture.'));
      else if (r.status === 'error') setAttachMsg(t('The photo could not be added.'));
    } finally {
      setAttachBusy(false);
    }
  };

  const removePhoto = (id: string) => {
    onActivity();
    const next = photos.filter((p) => p !== id);
    setPhotos(next);
    setAttachMsg('');
    edit({ photos: next.length ? next : [] });
  };

  const doAddPlace = async () => {
    if (attachBusy) return;
    onActivity();
    setAttachBusy(true);
    setAttachMsg(t('Looking for your location…'));
    try {
      const r = await findPlace();
      if (r.status === 'ok') {
        setPlace(r.place);
        setAttachMsg('');
        edit({ place: r.place });
      } else setAttachMsg(r.status === 'denied' ? t('Location is not allowed. You can allow it in the iPhone settings.') : t('The location could not be found.'));
    } finally {
      setAttachBusy(false);
    }
  };

  const removePlace = () => {
    onActivity();
    setPlace(undefined);
    setAttachMsg('');
    session.change({ mood, title, text, tags, ...(photos.length ? { photos } : {}) });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={onDiscard} style={styles.discard}>
          <Text style={styles.discardText}>{t('Discard changes')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.date}>{dateLabel}</Text>
      </View>

      <TextInput
        accessibilityLabel={t('Entry title')}
        placeholder={t('Give it a name (optional)')}
        placeholderTextColor={colors.textFaint}
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          edit({ title: v });
        }}
        style={styles.title}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={preview ? t('Back to editing') : t('Preview')}
        aria-selected={preview}
        onPress={() => setPreview((p) => !p)}
        style={styles.previewBtn}
      >
        <Text style={styles.previewBtnText}>{preview ? t('Back to editing') : t('Preview')}</Text>
      </Pressable>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {preview ? (
        <View style={styles.previewBox}>
          {text.trim() === '' ? (
            <Text style={styles.dictationHint}>{t('Nothing to preview yet.')}</Text>
          ) : (
            <MarkdownView text={text} linkExists={(l) => resolveLink(l, pool) !== null} />
          )}
        </View>
      ) : (
      <TextInput
        accessibilityLabel={t('Entry text')}
        placeholder={t('Start writing…')}
        placeholderTextColor={colors.textFaint}
        value={text}
        onChangeText={(v) => {
          setText(v);
          edit({ text: v });
        }}
        multiline
        scrollEnabled={false}
        onContentSizeChange={(e) => setBodyH(Math.max(170, Math.ceil(e.nativeEvent.contentSize.height)))}
        textAlignVertical="top"
        autoFocus={dictate || initial.text === ''}
        style={[styles.body, { height: bodyH }]}
      />
      )}
      {!preview && text.trim() === '' && (
        <Text style={styles.dictationHint}>
          {t("🎤 Tap the microphone on your keyboard to dictate. iOS does the voice recognition, not this app; whether audio stays on the phone depends on your iPhone's dictation settings.")}
        </Text>
      )}

      {(linkTargets.length > 0 || backlinks.length > 0) && (
        <View style={styles.linkBox}>
          {linkTargets.length > 0 && <Text style={styles.linkHead}>{t('Links in this entry')}</Text>}
          {linkTargets.map((l) => (
            <Pressable key={l.title} accessibilityRole="button" accessibilityLabel={t('Open {title}', { title: l.target.entry.title })} onPress={() => onOpenLinked(l.target)} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>↗ {l.target.entry.title}</Text>
            </Pressable>
          ))}
          {backlinks.length > 0 && <Text style={styles.linkHead}>{t('Linked from')}</Text>}
          {backlinks.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={t('Open entry linking here from {date}', { date: shortDay(b.day) })} onPress={() => onOpenLinked(b)} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>↙ {shortDay(b.day)}{b.entry.title ? ' · ' + b.entry.title : ''}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!preview && (
      <View style={styles.tplRow} accessibilityLabel={t('Templates')}>
        {templates(t).map((tp) => (
          <Pressable
            key={tp.id}
            accessibilityRole="button"
            accessibilityLabel={t('Insert template {name}', { name: tp.name })}
            onPress={() => {
              const next = applyTemplate(text, tp.body);
              setText(next);
              edit({ text: next });
            }}
            style={styles.tplChip}
          >
            <Text style={styles.tplText}>{tp.name}</Text>
          </Pressable>
        ))}
      </View>
      )}

      <Attachments photos={photos} place={place} loadPhoto={loadPhoto} onAddPhoto={() => void doAddPhoto()} onRemovePhoto={removePhoto} onAddPlace={() => void doAddPlace()} onRemovePlace={removePlace} busy={attachBusy} message={attachMsg} />

      <View style={styles.tagRow}>
        {tags.map((g) => (
          <Pressable key={g} accessibilityRole="button" accessibilityLabel={t('Remove tag {tag}', { tag: g })} onPress={() => removeTag(g)} style={styles.chip}>
            <Text style={styles.chipText}>#{g}  ✕</Text>
          </Pressable>
        ))}
        {tags.length < MAX_TAGS && (
          <TextInput
            accessibilityLabel={t('Add a tag')}
            placeholder={t('Add a tag')}
            placeholderTextColor={colors.textFaint}
            value={tagDraft}
            maxLength={MAX_TAG_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit={false}
            onChangeText={(v) => {
              if (v.endsWith(',')) commitTag(v.slice(0, -1));
              else setTagDraft(v);
            }}
            onSubmitEditing={() => commitTag(tagDraft)}
            onBlur={() => commitTag(tagDraft)}
            style={styles.tagInput}
          />
        )}
      </View>

      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.moodLabel}>{t('How did today feel?')}</Text>
        <View style={styles.moodRow}>
          {[1, 2, 3, 4, 5].map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={t('Mood: {mood}', { mood: t(moodNames[m]) }) + (mood === m ? ', ' + t('selected') : '')}
              aria-selected={mood === m}
              onPress={() => {
                setMood(m);
                edit({ mood: m });
              }}
              style={styles.moodBtn}
            >
              <View style={[styles.moodDot, { backgroundColor: moodColors[m] }, mood === m && styles.moodDotSel]} />
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={styles.save}
        >
          <Text style={styles.saveText}>{t('Done')}</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.note}>{STATUS_TEXT[status]}</Text>
        <Pressable accessibilityRole="button" onPress={onTrash} style={styles.trashBtn}>
          <Text style={styles.trashText}>{t('Move to trash')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 28 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  discard: { height: 48, marginLeft: -12, paddingHorizontal: 12, justifyContent: 'center' },
  discardText: { color: colors.textDim, fontSize: 14, fontFamily: fonts.sansMedium },
  date: { fontSize: 13, color: colors.textDim, fontFamily: fonts.sans },
  title: { fontSize: 30, color: colors.text, paddingBottom: 12, minHeight: 48, fontFamily: fonts.serifMedium },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 8 },
  body: { minHeight: 170, fontSize: 20, lineHeight: 32, color: colors.text, fontFamily: fonts.serif },
  dictationHint: { fontSize: 12, lineHeight: 17, color: colors.textDim, paddingVertical: 6, fontFamily: fonts.sans },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8 },
  previewBtn: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  previewBtnText: { color: colors.accent, fontSize: 14, fontFamily: fonts.sansMedium },
  previewBox: { minHeight: 170, marginBottom: 8 },
  linkBox: { marginBottom: 8 },
  linkHead: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textDim, fontFamily: fonts.sansBold, marginTop: 4 },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  linkBtnText: { color: colors.accent, fontSize: 14, fontFamily: fonts.sansMedium },
  tplRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tplChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.outline, justifyContent: 'center' },
  tplText: { color: colors.textDim, fontSize: 13, fontFamily: fonts.sansMedium },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center' },
  chipText: { color: colors.text, fontSize: 13, fontFamily: fonts.sansMedium },
  tagInput: { minHeight: 44, minWidth: 110, paddingVertical: 8, color: colors.text, fontSize: 13, fontFamily: fonts.sans, paddingHorizontal: 8 },
  trashBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  trashText: { color: colors.textDim, fontSize: 13, fontFamily: fonts.sansMedium },
  footer: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder, gap: 10 },
  moodLabel: { fontSize: 13, color: colors.textDim, fontFamily: fonts.sans },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moodBtn: { width: 56, height: 48, alignItems: 'center', justifyContent: 'center' },
  moodDot: { width: 24, height: 24, borderRadius: 12 },
  moodDotSel: { borderWidth: 3, borderColor: colors.text },
  save: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: colors.accentText, fontSize: 15, fontFamily: fonts.sansBold },
  note: { textAlign: 'center', fontSize: 12, color: colors.textFaint, fontFamily: fonts.sans },
});
