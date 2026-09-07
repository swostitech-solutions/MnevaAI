import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Purely informational — recovery already retries in the background with
// backoff (see recoverSession in App.js). This only tells the user why the
// screen looks stuck instead of leaving them staring at blank/stale data
// with no explanation, which previously read as "the app is fully broken."
export default function ServerBusyBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
      <View style={styles.banner}>
        <ActivityIndicator size="small" color="#1D4ED8" style={styles.icon} />
        <Text style={styles.text}>Reconnecting to server — retrying automatically…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 50 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  icon: { marginRight: 8 },
  text: { flex: 1, fontSize: 12, color: "#1E3A8A", fontWeight: "600" },
});
