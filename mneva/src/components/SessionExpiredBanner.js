import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Purely informational — tapping "Sign in" only navigates to the Signin
// screen. It never clears the stored token or forces navigation on its own;
// the user still signs out only via the explicit logout button.
export default function SessionExpiredBanner({ onSignIn, onDismiss }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <Feather name="alert-circle" size={16} color="#B45309" style={styles.icon} />
        <Text style={styles.text}>Session expired — sign in again to keep syncing.</Text>
        <TouchableOpacity onPress={onSignIn} style={styles.signInBtn}>
          <Text style={styles.signInText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
          <Feather name="x" size={14} color="#92400E" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 50 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
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
  text: { flex: 1, fontSize: 12, color: "#92400E", fontWeight: "600" },
  signInBtn: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#B45309" },
  signInText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
  closeBtn: { marginLeft: 6, padding: 2 },
});
