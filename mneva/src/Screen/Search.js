import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { useTheme } from '../context/ThemeContext';

const TYPE_META = {
  email:   { icon: 'mail',        color: '#615FF8', bg: '#EEEDFE' },
  sms:     { icon: 'message-square', color: '#4FA6E8', bg: '#EAF3FD' },
  payment: { icon: 'credit-card', color: '#1F9A5A', bg: '#EFFDF6' },
  health:  { icon: 'heart',       color: '#E0546E', bg: '#FCEAED' },
  document:{ icon: 'file-text',   color: '#F5A623', bg: '#FEF3C7' },
  memory:  { icon: 'cpu',         color: '#9B72FF', bg: '#F3EFFE' },
};

// Dark-mode counterparts for the pastel `bg` tints above — a translucent
// version of the same hue instead of the flat light pastel, which would
// otherwise sit as a bright patch on a near-black card.
const TYPE_META_DARK_BG = {
  email: 'rgba(129,128,255,0.18)',
  sms: 'rgba(107,184,240,0.18)',
  payment: 'rgba(52,199,123,0.18)',
  health: 'rgba(241,113,134,0.16)',
  document: 'rgba(255,184,77,0.16)',
  memory: 'rgba(155,114,255,0.18)',
};

const getMeta = (type, theme) => TYPE_META[type] || { icon: 'search', color: theme.muted, bg: theme.soft };

export default function Search({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const hPad = width < 360 ? 16 : 20;
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const doSearch = async (q) => {
    if (q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const data = await apiFetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 350);
  };

  const renderItem = ({ item }) => {
    const meta = getMeta(item.type, theme);
    const bg = theme.isDark ? (TYPE_META_DARK_BG[item.type] || theme.soft) : meta.bg;
    return (
      <View style={styles.resultCard}>
        <View style={[styles.resultIcon, { backgroundColor: bg }]}>
          <Feather name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.snippet && (
            <Text style={styles.resultSnippet} numberOfLines={2}>{item.snippet}</Text>
          )}
        </View>
        <View style={[styles.typeBadge, { backgroundColor: bg }]}>
          <Text style={[styles.typeBadgeText, { color: meta.color }]}>{item.type}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: hPad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={theme.faint} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search emails, payments, health…"
            placeholderTextColor={theme.placeholder}
            value={query}
            onChangeText={handleChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}>
              <Feather name="x" size={16} color={theme.faint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentAlt} size="large" />
          <Text style={styles.loadingText}>Searching across all domains…</Text>
        </View>
      ) : results === null ? (
        <View style={styles.center}>
          <View style={styles.emptyIconWrap}>
            <Feather name="search" size={32} color={theme.disabled} />
          </View>
          <Text style={styles.emptyTitle}>Search everything</Text>
          <Text style={styles.emptySub}>Emails · Payments · Health · Documents · Memories</Text>
          <View style={styles.hintRow}>
            {['invoice', 'appointment', 'Swiggy', 'steps'].map(h => (
              <TouchableOpacity key={h} style={styles.hintChip} onPress={() => { setQuery(h); doSearch(h); }}>
                <Text style={styles.hintChipText}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={32} color={theme.disabled} />
          <Text style={styles.emptyTitle}>No results for "{query}"</Text>
          <Text style={styles.emptySub}>Try a different keyword</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: theme.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderWidth: 1.5,
    borderColor: theme.accentAlt,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.text,
    padding: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.soft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
  emptySub: { fontSize: 13, color: theme.faint, textAlign: 'center', lineHeight: 19 },
  loadingText: { fontSize: 13, color: theme.faint, marginTop: 12 },
  hintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center' },
  hintChip: {
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.borderStrong,
  },
  hintChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  resultCount: { fontSize: 12, fontWeight: '700', color: theme.faint, marginBottom: 8, letterSpacing: 0.3 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  resultIcon: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  resultText: { flex: 1 },
  resultTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 },
  resultSnippet: { fontSize: 12, color: theme.muted, lineHeight: 17 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
});
