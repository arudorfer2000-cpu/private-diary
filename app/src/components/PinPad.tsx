import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme';
import { useTheme } from '../themeContext';
import type { Palette } from '../palettes';

type Props = {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  length?: number;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'Delete'];

export default function PinPad({ onComplete, disabled = false, length = 6 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pin, setPin] = useState('');

  const press = (key: string) => {
    if (disabled) return;
    if (key === 'Delete') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= length) return;
    const next = pin + key;
    setPin(next);
    if (next.length === length) {
      // short pause so the last dot is seen, then hand over and clear
      setTimeout(() => {
        onComplete(next);
        setPin('');
      }, 120);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessible accessibilityLabel={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={[styles.pad, disabled && styles.padDisabled]}>
        {KEYS.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.keyEmpty} />
          ) : (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={k === 'Delete' ? 'Delete last digit' : k}
              accessibilityState={{ disabled }}
              onPress={() => press(k)}
              style={({ pressed }) => [styles.key, k === 'Delete' && styles.keyDelete, pressed && !disabled && styles.keyPressed]}
            >
              <Text style={k === 'Delete' ? styles.keyDeleteText : styles.keyText}>{k}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 16, marginTop: 28, marginBottom: 26 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#4C7B7E' },
  dotFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  pad: { width: 72 * 3 + 24 * 2, flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 14 },
  padDisabled: { opacity: 0.35 },
  key: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { width: 72, height: 72 },
  keyDelete: { backgroundColor: 'transparent' },
  keyPressed: { backgroundColor: '#1D3438' },
  keyText: { fontSize: 26, color: colors.text, fontFamily: fonts.sans },
  keyDeleteText: { fontSize: 14, color: colors.text, fontFamily: fonts.sans },
});
