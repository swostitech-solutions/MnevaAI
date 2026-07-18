

import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";

export default function Splash() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Soft light halo behind the icon */}
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient
            id="glow"
            cx="50%"
            cy="42%"
            rx="45%"
            ry="30%"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor="#7B5FE8" stopOpacity="0.10" />
            <Stop offset="40%" stopColor="#7B5FE8" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="#FAFAFC" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
      </Svg>

      <Image
        source={require("../../assets/mneva-m-icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />

      <Text style={styles.title}>MNEVA AI</Text>
      <Text style={styles.subtitle}>Your personal AI chief of staff</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 130,
    height: 120,
  },
  title: {
    marginTop: 30,
    fontSize: 23,
    fontWeight: "700",
    color: "#14171F",
    letterSpacing: 5,
  },
  subtitle: {
    marginTop: 18,
    fontSize: 14,
    color: "#6B7280",
    letterSpacing: 0.2,
  },
});