import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AppState, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Splash from './src/Screen/Splash';
import Onboarding from './src/Screen/Onboarding';
import Signin from './src/Screen/Signin';
import Signup from './src/Screen/Signup';
import VerifyOtp from './src/Screen/VerifyOtp';
import Home from './src/Screen/Home';
import Priorities from './src/Screen/Priorities';
import Askai from './src/Screen/Askai';
import Space from './src/Screen/Space';
import Profile from './src/Screen/Profile';
import Finance from './src/Screen/Finance';
import Communications from './src/Screen/Communications';
import Health from './src/Screen/Health';
import LifeOps from './src/Screen/LifeOps';
import TwinDiary from './src/Screen/TwinDiary';
import ConnectedAccounts from './src/Screen/ConnectedAccounts';
import Tasks from './src/Screen/Tasks';
import GoogleWorkspace from './src/Screen/GoogleWorkspace';
import Docs from './src/Screen/Docs';
import Sheets from './src/Screen/Sheets';
import Slides from './src/Screen/Slides';
import GoogleDrive from './src/Screen/GoogleDrive';
import MediaDiscovery from './src/Screen/MediaDiscovery';
import MusicDiscovery from './src/Screen/MusicDiscovery';
import MovieDiscovery from './src/Screen/MovieDiscovery';
import SportsDiscovery from './src/Screen/SportsDiscovery';
import NewsDiscovery from './src/Screen/NewsDiscovery';
import NewsStory from './src/Screen/NewsStory';
import AIProfile from './src/Screen/AIProfile';
import Settings from './src/Screen/Settings';
import Subscription from './src/Screen/Subscription';
import Search from './src/Screen/Search';
import MorningBriefing from './src/Screen/MorningBriefing';
import Contacts from './src/Screen/Contacts';
import Family from './src/Screen/Family';
import FamilyTasks from './src/Screen/FamilyTasks';
import ParentMedication from './src/Screen/ParentMedication';
import PetCare from './src/Screen/PetCare';
import ChildrenActivities from './src/Screen/ChildrenActivities';
import HomeMaintenance from './src/Screen/HomeMaintenance';
import CelebrationGifting from './src/Screen/CelebrationGifting';
import FamilyCalendar from './src/Screen/FamilyCalendar';
import PhoneAlerts from './src/Screen/PhoneAlerts';
import PhoneAlertDetail from './src/Screen/PhoneAlertDetail';
import { clearAuth, getStoredAuth } from './src/storage/auth';
import { apiFetch, onSessionExpired, pingBackend } from './src/api/client';
// Wake Render backend immediately on JS bundle load — before any screen mounts
pingBackend();
import { getSocket, resetSocket } from './src/services/socket';
import { refreshAppData } from './src/services/dataRefresh';
import ReminderAlert from './src/components/ReminderAlert';

const Stack = createNativeStackNavigator();

// Maps deep link path → screen name (mneva://<path>?...)
const DEEP_LINK_ROUTES = {
  contacts:  'Contacts',
  gmail:     'Communications',
  calendar:  'Priorities',
  googlefit: 'Health',
  settings:  'ConnectedAccounts',
};

// Maps drive OAuth callback query params → screen to return to
const DRIVE_CALLBACK_SCREENS = {
  GoogleDrive: 'GoogleDrive',
  Docs:        'Docs',
  Sheets:      'Sheets',
  Slides:      'Slides',
};

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FAFAFC',
    card: '#FAFAFC',
  },
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [initialRoute, setInitialRoute] = useState(null);
  const navigationRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const recoveryTimerRef = useRef(null);
  const recoveryPromiseRef = useRef(null);
  const recoveryAttemptRef = useRef(0);
  const refreshTimersRef = useRef([]);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  const refreshMountedData = useCallback(() => {
    refreshTimersRef.current.forEach(clearTimeout);
    refreshTimersRef.current = [];
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
        return false;
      }

      try {
        // Recovery owns retries, so make one request here rather than stacking
        // apiFetch retries on top of this loop and amplifying backend outages.
        await apiFetch('/api/auth/me', { retry: false });
        clearRecoveryTimer();
        recoveryAttemptRef.current = 0;
        // getSocket reuses a healthy socket and starts/restarts one only when
        // needed. It intentionally runs after auth validation.
        getSocket().catch(() => {});
        refreshMountedData();
        return true;
      } catch (error) {
        // apiFetch notifies the global expiry handler for 401 responses. Do
        // not keep retrying a session that has genuinely expired.
        if (error?.status === 401) return false;

        const attempt = recoveryAttemptRef.current;
        recoveryAttemptRef.current += 1;
        // Rate limiting needs a slower cadence than transient network errors.
        // Other recoverable errors use a capped exponential backoff.
        const delay = error?.status === 429
          ? 60000
          : Math.min(1000 * (2 ** Math.min(attempt, 5)), 30000);
        clearRecoveryTimer();
        recoveryTimerRef.current = setTimeout(() => {
          recoveryTimerRef.current = null;
          // Do not revive a suspended app; foregrounding will resume recovery.
          // AppState can briefly be null during cold launch, which is still a
          // foreground state for this purpose.
          if (!/inactive|background/.test(appStateRef.current || '')) recoverSession().catch(() => {});
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
      if (recoveryPromiseRef.current === recovery) recoveryPromiseRef.current = null;
    }
  }, [clearRecoveryTimer, refreshMountedData]);

  // Handle deep links from OAuth callbacks e.g. mneva://contacts?contacts=connected
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (!url || !navigationRef.current) return;
      try {
        const path = url.replace(/^[a-z]+:\/\//, '').split('?')[0];
        const params = Object.fromEntries(new URLSearchParams(url.split('?')[1] || ''));
        const screen = DEEP_LINK_ROUTES[path];
        const isOAuthCallback = url.includes('connected') || url.includes('=error');
        // Drive OAuth callback — return to the originating screen
        if (params.drive !== undefined) {
          const returnScreen = DRIVE_CALLBACK_SCREENS[params.from] || 'GoogleDrive';
          navigationRef.current.navigate(returnScreen);
        } else if (screen) {
          navigationRef.current.navigate(screen);
        } else if (isOAuthCallback) {
          navigationRef.current.navigate('ConnectedAccounts');
        }
      } catch {}
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); }).catch(() => {});
    return () => sub.remove();
  }, []);

  // Keep the authenticated app alive when Android/iOS resumes a suspended
  // network connection. Every mounted screen re-registers its socket handlers
  // after this fresh connection succeeds.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const wasBackgrounded = /inactive|background/.test(appStateRef.current || '');
      appStateRef.current = state;
      if (!wasBackgrounded || state !== 'active') return;
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
    const interval = setInterval(async () => {
      if (!/inactive|background/.test(appStateRef.current || '')) {
        const recovered = await recoverSession().catch(() => false);
        // If recovery succeeded after a previous failure, screens need a nudge
        // because their useEffect already ran and won't re-fire automatically.
        if (recovered) refreshMountedData();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [recoverSession, refreshMountedData]);

  // This belongs at app level, not only Home: an expired session from any
  // screen must recover to sign-in instead of leaving that screen inert.
  useEffect(() => {
    const unsub = onSessionExpired(async () => {
      await clearAuth().catch(() => {});
      resetSocket();
      setInitialRoute('Signin');
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Signin' }] });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    (async () => {
      try {
        // Do this on *every* cold start, not only after app backgrounding.
        // Previously a saved session opened Home with a stale connection, while
        // logging in manually happened to perform this recovery sequence.
        const { token } = await getStoredAuth();
        setInitialRoute(token ? 'Home' : 'Onboarding');
        if (token) recoverSession().catch(() => {});
      } catch {
        setInitialRoute('Onboarding');
      }
    })();
    return () => clearTimeout(splashTimer);
  }, [recoverSession]);

  useEffect(() => () => {
    clearRecoveryTimer();
    refreshTimersRef.current.forEach(clearTimeout);
  }, [clearRecoveryTimer]);

  if (showSplash || !initialRoute) {
    return (
      <SafeAreaProvider>
        <Splash />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={AppTheme} ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FAFAFC' },
            animation: 'fade',
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
          <Stack.Screen name="ConnectedAccounts" component={ConnectedAccounts} />
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
          <Stack.Screen name="ChildrenActivities" component={ChildrenActivities} />
          <Stack.Screen name="HomeMaintenance" component={HomeMaintenance} />
          <Stack.Screen name="CelebrationGifting" component={CelebrationGifting} />
          <Stack.Screen name="FamilyCalendar" component={FamilyCalendar} />
        </Stack.Navigator>
        <ReminderAlert />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
