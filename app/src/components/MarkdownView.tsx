import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme';
import { useTheme } from '../themeContext';
import type { Palette } from '../palettes';
import { parseMarkdown, type Inline } from '../markdown/markdown';

type Props = {
  text: string;
  /** Does [[Title]] point to an existing entry? Missing targets are drawn as plain brackets. */
  linkExists: (title: string) => boolean;
};

/** Draws diary text with light formatting. Links are only styled here; they are opened from the buttons below the text. */
export default function MarkdownView({ text, linkExists }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  const inline = (items: Inline[]) =>
    items.map((it, i) => {
      if (it.kind === 'bold') return <Text key={i} style={styles.bold}>{it.text}</Text>;
      if (it.kind === 'italic') return <Text key={i} style={styles.italic}>{it.text}</Text>;
      if (it.kind === 'link') return linkExists(it.text) ? <Text key={i} style={styles.link}>{it.text}</Text> : <Text key={i} style={styles.missing}>{`[[${it.text}]]`}</Text>;
      return <Text key={i}>{it.text}</Text>;
    });

  return (
    <View>
      {blocks.map((b, i) => {
        if (b.kind === 'h1') return <Text key={i} accessibilityRole="header" style={styles.h1}>{inline(b.inlines)}</Text>;
        if (b.kind === 'h2') return <Text key={i} accessibilityRole="header" style={styles.h2}>{inline(b.inlines)}</Text>;
        if (b.kind === 'h3') return <Text key={i} accessibilityRole="header" style={styles.h3}>{inline(b.inlines)}</Text>;
        if (b.kind === 'quote') return <View key={i} style={styles.quote}><Text style={styles.quoteText}>{inline(b.inlines)}</Text></View>;
        if (b.kind === 'li')
          return (
            <View key={i} style={styles.li}>
              <Text style={styles.marker}>{b.marker}</Text>
              <Text style={styles.liText}>{inline(b.inlines)}</Text>
            </View>
          );
        return <Text key={i} style={styles.p}>{inline(b.inlines)}</Text>;
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  p: { fontSize: 17, lineHeight: 27, color: colors.text, fontFamily: fonts.serif, marginBottom: 12 },
  h1: { fontSize: 26, lineHeight: 32, color: colors.text, fontFamily: fonts.serifMedium, marginTop: 8, marginBottom: 10 },
  h2: { fontSize: 22, lineHeight: 28, color: colors.text, fontFamily: fonts.serifMedium, marginTop: 6, marginBottom: 8 },
  h3: { fontSize: 18, lineHeight: 24, color: colors.text, fontFamily: fonts.serifMedium, marginTop: 4, marginBottom: 6 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 12, marginBottom: 12 },
  quoteText: { fontSize: 17, lineHeight: 27, color: colors.textDim, fontFamily: fonts.serif, fontStyle: 'italic' },
  li: { flexDirection: 'row', gap: 8, marginBottom: 6, paddingLeft: 4 },
  marker: { fontSize: 17, lineHeight: 27, color: colors.textDim, fontFamily: fonts.serif, minWidth: 22 },
  liText: { flex: 1, fontSize: 17, lineHeight: 27, color: colors.text, fontFamily: fonts.serif },
  bold: { fontFamily: fonts.sansBold },
  italic: { fontStyle: 'italic' },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  missing: { color: colors.textDim },
});
