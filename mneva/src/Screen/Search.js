import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TYPE_META = {
  email:   { icon: 'mail',        color: '#615FF8', bg: '#EEEDFE' },
  sms:     { icon: 'message-square', color: '#4FA6E8', bg: '#EAF3FD' },
  payment: { icon: 'credit-card', color: '#1F9A5A', bg: '#EFFDF6' },
  health:  { icon: 'heart',       color: '#E0546E', bg: '#FCEAED' },
  document:{ icon: 'file-text',   color: '#F5A623', bg: '#FEF3C7' },
  memory:  { icon: 'cpu',         color: '#9B72FF', bg: '#F3EFFE' },
};

const getMeta = (type) => TYPE_META[type] || { icon: 'search', color: '#6B7280', bg: '#F3F4F6' };

export default function Search({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
    const meta = getMeta(item.type);
    return (
      <View style={styles.resultCard}>
        <View style={[styles.resultIcon, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.snippet && (
            <Text style={styles.resultSnippet} numberOfLines={2}>{item.snippet}</Text>
          )}
        </View>
        <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
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
          <Feather name="arrow-left" size={22} color="#14171F" />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color="#9AA1AE" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search emails, payments, health…"
            placeholderTextColor="#9AA1AE"
            value={query}
            onChangeText={handleChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}>
              <Feather name="x" size={16} color="#9AA1AE" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7B5FE8" size="large" />
          <Text style={styles.loadingText}>Searching across all domains…</Text>
        </View>
      ) : results === null ? (
        <View style={styles.center}>
          <View style={styles.emptyIconWrap}>
            <Feather name="search" size={32} color="#C7CBD3" />
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
          <Feather name="inbox" size={32} color="#C7CBD3" />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#7B5FE8',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#14171F',
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
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#14171F' },
  emptySub: { fontSize: 13, color: '#9AA1AE', textAlign: 'center', lineHeight: 19 },
  loadingText: { fontSize: 13, color: '#9AA1AE', marginTop: 12 },
  hintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center' },
  hintChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E3E5EA',
  },
  hintChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  resultCount: { fontSize: 12, fontWeight: '700', color: '#9AA1AE', marginBottom: 8, letterSpacing: 0.3 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 3 },
  resultSnippet: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
});
