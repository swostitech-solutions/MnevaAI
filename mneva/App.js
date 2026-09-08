import React, { useEffect, useState, useRef, useCallback } from "react";
import { AppState, Linking } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import Splash from "./src/Screen/Splash";
import Onboarding from "./src/Screen/Onboarding";
import Signin from "./src/Screen/Signin";
import Signup from "./src/Screen/Signup";
import VerifyOtp from "./src/Screen/VerifyOtp";
import Home from "./src/Screen/Home";
import Priorities from "./src/Screen/Priorities";
import Askai from "./src/Screen/Askai";
import Space from "./src/Screen/Space";
import Profile from "./src/Screen/Profile";
import Finance from "./src/Screen/Finance";
import Communications from "./src/Screen/Communications";
import Health from "./src/Screen/Health";
import LifeOps from "./src/Screen/LifeOps";
import TwinDiary from "./src/Screen/TwinDiary";
import ConnectedAccounts from "./src/Screen/ConnectedAccounts";
import Tasks from "./src/Screen/Tasks";
import GoogleWorkspace from "./src/Screen/GoogleWorkspace";
import Docs from "./src/Screen/Docs";
import Sheets from "./src/Screen/Sheets";
import Slides from "./src/Screen/Slides";
import GoogleDrive from "./src/Screen/GoogleDrive";
import MediaDiscovery from "./src/Screen/MediaDiscovery";
import MusicDiscovery from "./src/Screen/MusicDiscovery";
import MovieDiscovery from "./src/Screen/MovieDiscovery";
import SportsDiscovery from "./src/Screen/SportsDiscovery";
import NewsDiscovery from "./src/Screen/NewsDiscovery";
import NewsStory from "./src/Screen/NewsStory";
import AIProfile from "./src/Screen/AIProfile";
import Settings from "./src/Screen/Settings";
import Subscription from "./src/Screen/Subscription";
import Search from "./src/Screen/Search";
import MorningBriefing from "./src/Screen/MorningBriefing";
import Contacts from "./src/Screen/Contacts";
import Family from "./src/Screen/Family";
import FamilyTasks from "./src/Screen/FamilyTasks";
import ParentMedication from "./src/Screen/ParentMedication";
import PetCare from "./src/Screen/PetCare";
import ChildrenActivities from "./src/Screen/ChildrenActivities";
import HomeMaintenance from "./src/Screen/HomeMaintenance";
import CelebrationGifting from "./src/Screen/CelebrationGifting";
import FamilyCalendar from "./src/Screen/FamilyCalendar";
import PhoneAlerts from "./src/Screen/PhoneAlerts";
import PhoneAlertDetail from "./src/Screen/PhoneAlertDetail";
import { getStoredAuth } from "./src/storage/auth";
import { apiFetch, pingBackend } from "./src/api/client";
// Wake Render backend immediately on JS bundle load — before any screen mounts
pingBackend();
import {
  getSocket,
  resetSocket,
  onSocketReconnect,
} from "./src/services/socket";
import { refreshAppData } from "./src/services/dataRefresh";
import { registerForPushNotifications } from "./src/services/pushNotifications";
import ReminderAlert from "./src/components/ReminderAlert";
import ErrorBoundary from "./src/components/ErrorBoundary";
import SessionExpiredBanner from "./src/components/SessionExpiredBanner";
import ServerBusyBanner from "./src/components/ServerBusyBanner";

const Stack = createNativeStackNavigator();

// Maps deep link path → screen name (mneva://<path>?...)
const DEEP_LINK_ROUTES = {
  contacts: "Contacts",
  gmail: "Communications",
  calendar: "Priorities",
  googlefit: "Health",
  settings: "ConnectedAccounts",
};

// Maps drive OAuth callback query params → screen to return to
const DRIVE_CALLBACK_SCREENS = {
  GoogleDrive: "GoogleDrive",
  Docs: "Docs",
  Sheets: "Sheets",
  Slides: "Slides",
};

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#FAFAFC",
    card: "#FAFAFC",
  },
};

function AppInner() {
  const [showSplash, setShowSplash] = useState(true);
  const [initialRoute, setInitialRoute] = useState(null);
  // Purely informational — never forces logout or navigation. Shown only
  // after several consecutive confirmed 401s (not on the first, since a
  // cold-start/backend-wake race can look like a 401 too — see bb84eab).
  // The user still signs out only via the explicit logout button.
  const [sessionExpiredBanner, setSessionExpiredBanner] = useState(false);
  // Shown only once transient recovery has actually failed a couple of times
  // in a row (not on the first retry) — see recoverSession below. Tells the
  // user *why* the screen looks stuck instead of leaving them staring at a
  // silent blank/stale screen, which previously read as "the app is fully broken."
  const [serverBusyBanner, setServerBusyBanner] = useState(false);
  const navigationRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const recoveryTimerRef = useRef(null);
  const recoveryPromiseRef = useRef(null);
  const recoveryAttemptRef = useRef(0);
  const refreshTimersRef = useRef([]);
  const activeRouteRef = useRef(null);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  const refreshMountedData = useCallback(() => {
    // One immediate pass handles a healthy connection; a second pass covers
    // screens that were still mounting or a socket that has just reconnected.
    refreshAppData();
    refreshTimersRef.current.forEach(clearTimeout);
    refreshTimersRef.current = [setTimeout(refreshAppData, 1500)];
  }, []);

  const handleNavigationStateChange = useCallback(() => {
    const route = navigationRef.current?.getCurrentRoute?.();
    if (!route || route.name === activeRouteRef.current) return;
    activeRouteRef.current = route.name;
    // If the backend is sleeping, wake it before we reload the route data.
    pingBackend().catch(() => {});
    // Screens load on mount, while this signal makes already-mounted screens
    // refresh immediately when the user returns to a tab.
    refreshAppData();
  }, []);

  // A saved token alone does not mean the existing mobile connection is ready.
  // Validate the API session and ensure a socket exists without tearing down a
  // working connection. Transient mobile-network and Render wake-up failures
  // retry indefinitely with a capped backoff; only a confirmed 401 is final.
  const recoverSession = useCallback(async () => {
    if (recoveryPromiseRef.current) return recoveryPromiseRef.current;

    const recovery = (async () => {
      const { token } = await getStoredAuth();
      if (!token) {
        clearRecoveryTimer();
        recoveryAttemptRef.current = 0;
        setSessionExpiredBanner(false);
        setServerBusyBanner(false);
        return false;
      }

      try {
        // Recovery owns retries, so make one request here rather than stacking
        // apiFetch retries on top of this loop and amplifying backend outages.
        await apiFetch("/api/auth/me", { retry: false });
        clearRecoveryTimer();
        recoveryAttemptRef.current = 0;
        setSessionExpiredBanner(false);
        setServerBusyBanner(false);
        getSocket().catch(() => {});
        refreshMountedData();
        return true;
      } catch (error) {
        // Never auto-logout on 401 — just retry with backoff.
        // The user can only be logged out by pressing the logout button.
        if (error?.status === 401) {
          const attempt = recoveryAttemptRef.current;
          recoveryAttemptRef.current += 1;
          // A single 401 can be a cold-start/backend-wake race, not a real
          // expiry (see bb84eab) — only surface the banner once it's been
          // wrong several times in a row.
          if (attempt >= 2) setSessionExpiredBanner(true);
          const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30000);
          clearRecoveryTimer();
          recoveryTimerRef.current = setTimeout(() => {
            recoveryTimerRef.current = null;
            if (!/inactive|background/.test(appStateRef.current || ""))
              recoverSession().catch(() => {});
          }, delay);
          return false;
        }

        const attempt = recoveryAttemptRef.current;
        recoveryAttemptRef.current += 1;
        // A single miss can be one slow request, not an outage — only tell
        // the user something's wrong once it's failed a couple of times in a
        // row. Exclude 429: that's this client's own rate-limit cooldown
        // (see api/client.js) quietly skipping the network call, not the
        // server being unreachable — showing "Reconnecting..." for it is
        // misleading when the rest of the screen already has real data.
        if (attempt >= 2 && error?.status !== 429) setServerBusyBanner(true);
        // Rate limiting needs a slower cadence than transient network errors.
        // Other recoverable errors use a capped exponential backoff.
        const delay =
          error?.status === 429
            ? 60000
            : Math.min(1000 * 2 ** Math.min(attempt, 5), 30000);
        clearRecoveryTimer();
        recoveryTimerRef.current = setTimeout(() => {
          recoveryTimerRef.current = null;
          // Do not revive a suspended app; foregrounding will resume recovery.
          // AppState can briefly be null during cold launch, which is still a
          // foreground state for this purpose.
          if (!/inactive|background/.test(appStateRef.current || ""))
            recoverSession().catch(() => {});
        }, delay);
        // This is an expected, self-healing condition. Do not use console.warn:
        // React Native displays warnings as an intrusive developer overlay.
        return false;
      }
    })();

    recoveryPromiseRef.current = recovery;
    try {
      return await recovery;
    } finally {
      if (recoveryPromiseRef.current === recovery)
        recoveryPromiseRef.current = null;
    }
  }, [clearRecoveryTimer, refreshMountedData]);

  // Handle deep links from OAuth callbacks e.g. mneva://contacts?contacts=connected
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (!url || !navigationRef.current) return;
      try {
        const path = url.replace(/^[a-z]+:\/\//, "").split("?")[0];
        const params = Object.fromEntries(
          new URLSearchParams(url.split("?")[1] || ""),
        );
        const screen = DEEP_LINK_ROUTES[path];
        const isOAuthCallback =
          url.includes("connected") || url.includes("=error");
        // Drive OAuth callback — return to the originating screen
        if (params.drive !== undefined) {
          const returnScreen =
            DRIVE_CALLBACK_SCREENS[params.from] || "GoogleDrive";
          navigationRef.current.navigate(returnScreen);
        } else if (screen) {
          navigationRef.current.navigate(screen);
        } else if (isOAuthCallback) {
          navigationRef.current.navigate("ConnectedAccounts");
        }
      } catch {}
    };
    const sub = Linking.addEventListener("url", handleUrl);
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleUrl({ url });
      })
      .catch(() => {});
    return () => sub.remove();
  }, []);

  // A Socket.IO reconnect restores realtime delivery, but it does not replay
  // events that were missed while disconnected. Refresh API-backed screens once
  // after every reconnect so the UI never depends on the socket being continuously connected.
  useEffect(() => {
    const unsub = onSocketReconnect(() => {
      refreshMountedData();
    });
    return () => unsub();
  }, [refreshMountedData]);

  // Keep the authenticated app alive when Android/iOS resumes a suspended
  // network connection. Every mounted screen re-registers its socket handlers
  // after this fresh connection succeeds.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const wasBackgrounded = /inactive|background/.test(
        appStateRef.current || "",
      );
      appStateRef.current = state;
      if (state === "active") {
        pingBackend().catch(() => {});
      }
      if (!wasBackgrounded || state !== "active") return;
      recoverSession().catch(() => {});
    });
    return () => {
      sub.remove();
      clearRecoveryTimer();
    };
  }, [clearRecoveryTimer, recoverSession]);

  // AppState changes are not the only way a mobile connection can go stale:
  // Wi-Fi/cellular handoffs and idle radios also happen while foregrounded.
  // This inexpensive authenticated heartbeat keeps the session self-healing.
  useEffect(() => {
    const interval = setInterval(() => {
      pingBackend();
      if (!/inactive|background/.test(appStateRef.current || ""))
        recoverSession().catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [recoverSession]);

  // A request that never reaches the server (dead Wi-Fi, weak cellular
  // signal, carrier handoff) leaves no trace to react to — the only signal
  // is the device's own radio state. Previously the app only found out the
  // network was back on the next scheduled poll (up to 60s away, or up to
  // 8s per screen's own retry loop). NetInfo reports the transition
  // immediately, so recovery — and every screen listening on
  // onAppDataRefresh — can fire the moment connectivity actually returns.
  useEffect(() => {
    let wasConnected = true;
    const unsub = NetInfo.addEventListener((state) => {
      const isConnected = !!(state.isConnected && state.isInternetReachable !== false);
      if (isConnected && !wasConnected) {
        pingBackend().catch(() => {});
        recoverSession().catch(() => {});
        refreshMountedData();
      }
      wasConnected = isConnected;
    });
    return () => unsub();
  }, [recoverSession, refreshMountedData]);

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    (async () => {
      try {
        // Do this on *every* cold start, not only after app backgrounding.
        // Previously a saved session opened Home with a stale connection, while
        // logging in manually happened to perform this recovery sequence.
        const { token } = await getStoredAuth();
        setInitialRoute(token ? "Home" : "Onboarding");
        if (token) {
          recoverSession().catch(() => {});
          // Registers this device's push token on every cold start (not
          // just login) so a user who stays signed in across app updates —
          // and never sees the Signin screen again — still gets registered
          // after this feature ships.
          registerForPushNotifications().catch(() => {});
        }
      } catch {
        setInitialRoute("Onboarding");
      }
    })();
    return () => clearTimeout(splashTimer);
  }, [recoverSession]);

  useEffect(
    () => () => {
      clearRecoveryTimer();
      refreshTimersRef.current.forEach(clearTimeout);
    },
    [clearRecoveryTimer],
  );

  if (showSplash || !initialRoute) {
    return (
      <SafeAreaProvider>
        <Splash />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={AppTheme}
        ref={navigationRef}
        onStateChange={handleNavigationStateChange}
      >
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FAFAFC" },
            animation: "fade",
          }}
        >
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="Signin" component={Signin} />
          <Stack.Screen name="Signup" component={Signup} />
          <Stack.Screen name="VerifyOtp" component={VerifyOtp} />
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Priorities" component={Priorities} />
          <Stack.Screen name="AskAI" component={Askai} />
          <Stack.Screen name="Space" component={Space} />
          <Stack.Screen name="Profile" component={Profile} />
          <Stack.Screen name="Finance" component={Finance} />
          <Stack.Screen name="Communications" component={Communications} />
          <Stack.Screen name="Health" component={Health} />
          <Stack.Screen name="LifeOps" component={LifeOps} />
          <Stack.Screen name="TwinDiary" component={TwinDiary} />
          <Stack.Screen
            name="ConnectedAccounts"
            component={ConnectedAccounts}
          />
          <Stack.Screen name="AIProfile" component={AIProfile} />
          <Stack.Screen name="Settings" component={Settings} />
          <Stack.Screen name="Subscription" component={Subscription} />
          <Stack.Screen name="Search" component={Search} />
          <Stack.Screen name="MorningBriefing" component={MorningBriefing} />
          <Stack.Screen name="Contacts" component={Contacts} />
          <Stack.Screen name="PhoneAlerts" component={PhoneAlerts} />
          <Stack.Screen name="PhoneAlertDetail" component={PhoneAlertDetail} />
          <Stack.Screen name="Tasks" component={Tasks} />
          <Stack.Screen name="GoogleWorkspace" component={GoogleWorkspace} />
          <Stack.Screen name="Docs" component={Docs} />
          <Stack.Screen name="Sheets" component={Sheets} />
          <Stack.Screen name="Slides" component={Slides} />
          <Stack.Screen name="GoogleDrive" component={GoogleDrive} />
          <Stack.Screen name="MediaDiscovery" component={MediaDiscovery} />
          <Stack.Screen name="MusicDiscovery" component={MusicDiscovery} />
          <Stack.Screen name="MovieDiscovery" component={MovieDiscovery} />
          <Stack.Screen name="SportsDiscovery" component={SportsDiscovery} />
          <Stack.Screen name="NewsDiscovery" component={NewsDiscovery} />
          <Stack.Screen name="NewsStory" component={NewsStory} />
          <Stack.Screen name="Family" component={Family} />
          <Stack.Screen name="FamilyTasks" component={FamilyTasks} />
          <Stack.Screen name="ParentMedication" component={ParentMedication} />
          <Stack.Screen name="PetCare" component={PetCare} />
          <Stack.Screen
            name="ChildrenActivities"
            component={ChildrenActivities}
          />
          <Stack.Screen name="HomeMaintenance" component={HomeMaintenance} />
          <Stack.Screen
            name="CelebrationGifting"
            component={CelebrationGifting}
          />
          <Stack.Screen name="FamilyCalendar" component={FamilyCalendar} />
        </Stack.Navigator>
        <ReminderAlert />
        {sessionExpiredBanner ? (
          <SessionExpiredBanner
            onSignIn={() => {
              setSessionExpiredBanner(false);
              navigationRef.current?.navigate("Signin");
            }}
            onDismiss={() => setSessionExpiredBanner(false)}
          />
        ) : serverBusyBanner ? (
          <ServerBusyBanner />
        ) : null}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
