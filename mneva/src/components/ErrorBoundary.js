import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Catches render/lifecycle errors anywhere below it in the tree so a single
// bad screen shows a recoverable fallback instead of RN's default red/white
// crash screen. Does not catch errors in event handlers or async code —
// those are handled by apiFetch's own try/catch.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (__DEV__) {
      console.error("ErrorBoundary caught:", error, info?.componentStack);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            Mneva ran into an unexpected error. You can try again — your data
            is safe.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>Restart</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FAFAFC" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 18, fontWeight: "800", color: "#14171F", marginBottom: 8 },
  message: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 20 },
  button: { backgroundColor: "#6C47FF", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
});
