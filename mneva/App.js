import React, { useEffect, useState, useRef } from 'react';
import { Linking } from 'react-native';
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
import AIProfile from './src/Screen/AIProfile';
import Settings from './src/Screen/Settings';
import Search from './src/Screen/Search';
import MorningBriefing from './src/Screen/MorningBriefing';
import Contacts from './src/Screen/Contacts';
import { getStoredAuth } from './src/storage/auth';
import ReminderAlert from './src/components/ReminderAlert';

const Stack = createNativeStackNavigator();

// Maps deep link path → screen name (mneva://<path>?...)
const DEEP_LINK_ROUTES = {
  contacts:  'Contacts',
  gmail:     'Communications',
  calendar:  'Priorities',
  googlefit: 'Health',
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

  // Handle deep links from OAuth callbacks e.g. mneva://contacts?contacts=connected
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (!url || !navigationRef.current) return;
      try {
        const path = url.replace(/^[a-z]+:\/\//, '').split('?')[0];
        const screen = DEEP_LINK_ROUTES[path];
        if (screen) navigationRef.current.navigate(screen);
      } catch {}
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); }).catch(() => {});
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    (async () => {
      try {
        const { token } = await getStoredAuth();
        setInitialRoute(token ? 'Home' : 'Onboarding');
      } catch {
        setInitialRoute('Onboarding');
      }
    })();
    return () => clearTimeout(splashTimer);
  }, []);

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
          <Stack.Screen name="Search" component={Search} />
          <Stack.Screen name="MorningBriefing" component={MorningBriefing} />
          <Stack.Screen name="Contacts" component={Contacts} />
        </Stack.Navigator>
        <ReminderAlert />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
