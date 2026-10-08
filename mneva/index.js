import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
// Handles rendering the home-screen widget(s) — called from a Headless JS
// task, independent of whether the app itself is open. See
// src/widgets/widgetTaskHandler.js.
registerWidgetTaskHandler(widgetTaskHandler);
