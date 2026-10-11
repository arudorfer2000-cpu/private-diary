import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme';
import { useTheme } from '../themeContext';
import { useI18n } from '../i18nContext';
import type { Palette } from '../palettes';
import type { Place } from '../types';
import { formatPlace } from '../place/place';
import { MAX_PHOTOS } from '../photos/base64';

type Props = {
  photos: string[];
  place: Place | undefined;
  /** A picture as a data address, or null when it cannot be read. */
  loadPhoto: (id: string) => Promise<string | null>;
  onAddPhoto: () => void;
  onRemovePhoto: (id: string) => void;
  onAddPlace: () => void;
  onRemovePlace: () => void;
  busy: boolean;
  message: string;
};

function Thumb({ id, n, load, onToggle, onRemove, open }: { id: string; n: number; load: Props['loadPhoto']; onToggle: () => void; onRemove: () => void; open: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void load(id).then((u) => alive && setUri(u)).catch(() => alive && setUri(null));
    return () => {
      alive = false;
    };
  }, [id, load]);
  return (
    <View style={styles.thumbCol}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Photo {n}, tap to enlarge', { n })} aria-selected={open} onPress={onToggle} style={styles.thumb}>
        {uri ? <Image source={{ uri }} style={styles.thumbImg} accessibilityIgnoresInvertColors /> : <Text style={styles.thumbWait}>{uri === null ? '⚠︎' : '…'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Remove photo {n}', { n })} onPress={onRemove} style={styles.removeBtn}>
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </View>
  );
}

export default function Attachments({ photos, place, loadPhoto, onAddPhoto, onRemovePhoto, onAddPlace, onRemovePlace, busy, message }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState<string | null>(null);
  const [openUri, setOpenUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setOpenUri(null);
    if (open) void loadPhoto(open).then((u) => alive && setOpenUri(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, loadPhoto]);
  useEffect(() => {
    if (open && !photos.includes(open)) setOpen(null);
  }, [photos, open]);

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        {photos.length < MAX_PHOTOS && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Add photo')} aria-disabled={busy} disabled={busy} onPress={onAddPhoto} style={[styles.btn, busy && styles.disabled]}>
            <Text style={styles.btnText}>📷 {t('Add photo')}</Text>
          </Pressable>
        )}
        {place ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Remove location {place}', { place: formatPlace(place) })} onPress={onRemovePlace} style={styles.btn}>
            <Text style={styles.btnText}>📍 {formatPlace(place)}  ✕</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Add location')} aria-disabled={busy} disabled={busy} onPress={onAddPlace} style={[styles.btn, busy && styles.disabled]}>
            <Text style={styles.btnText}>📍 {t('Add location')}</Text>
          </Pressable>
        )}
      </View>
      <View accessibilityLiveRegion="polite">{message !== '' && <Text style={styles.msg}>{message}</Text>}</View>
      {open && (
        <View style={styles.big}>
          {openUri ? <Image source={{ uri: openUri }} style={styles.bigImg} resizeMode="contain" accessibilityLabel={t('Enlarged photo')} accessibilityIgnoresInvertColors /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Close photo')} onPress={() => setOpen(null)} style={styles.btn}>
            <Text style={styles.btnText}>{t('Close photo')}</Text>
          </Pressable>
        </View>
      )}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {photos.map((id, i) => (
            <Thumb key={id} id={id} n={i + 1} load={loadPhoto} open={open === id} onToggle={() => setOpen(open === id ? null : id)} onRemove={() => onRemovePhoto(id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  box: { flexShrink: 0, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, justifyContent: 'center' },
  btnText: { color: colors.text, fontSize: 13, fontFamily: fonts.sansMedium },
  disabled: { opacity: 0.5 },
  msg: { marginTop: 6, fontSize: 12, color: colors.textDim, fontFamily: fonts.sans },
  big: { marginTop: 8, gap: 6, alignItems: 'flex-start' },
  bigImg: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.card },
  thumbs: { gap: 10, paddingTop: 8 },
  thumbCol: { alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 72, height: 72 },
  thumbWait: { color: colors.textDim, fontSize: 16 },
  removeBtn: { width: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.textDim, fontSize: 14, fontFamily: fonts.sansBold },
});
