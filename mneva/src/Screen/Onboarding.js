
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    key: "1",
    title: "Meet Your AI Chief of Staff",
    description:
      "Mneva handles your inbox, calendar, and finances so you can focus on what matters.",
  },
  {
    key: "2",
    title: "One Chat, Everything Handled",
    description:
      "Ask Mneva to draft replies, schedule meetings, or check your spending — all in real time.",
  },
  {
    key: "3",
    title: "Your Life, Organized",
    description:
      "Health, comms, finance, and daily ops — all connected in one intelligent assistant.",
  },
];

export default function Onboarding({ navigation }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  const handleNext = async () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
    } else {
      navigation.replace("Signin");
    }
  };

  const handleSkip = () => navigation.replace("Signin");

  const onScrollEnd = (e) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(newIndex);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <TouchableOpacity style={styles.skip} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Image
              source={require("../../assets/mneva-m-icon.png")}
              style={styles.badge}
              resizeMode="contain"
            />

            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <LinearGradient
          colors={["#7B5FE8", "#4FA6E8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.nextButtonGradient}
        >
          <Text style={styles.nextButtonText}>
            {index === SLIDES.length - 1 ? "Get Started" : "Next"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFC",
  },
  skip: {
    position: "absolute",
    top: 60,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "600",
  },
  slide: {
    width,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  badge: {
    width: 100,
    height: 92,
    marginBottom: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#14171F",
    textAlign: "center",
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 30,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E4E7EF",
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: "#7B5FE8",
    width: 20,
  },
  nextButton: {
    marginHorizontal: 24,
    marginBottom: 50,
    borderRadius: 14,
    overflow: "hidden",
  },
  nextButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});