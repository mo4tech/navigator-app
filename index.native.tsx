// index.native.tsx
import { AppRegistry, I18nManager } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import App from './App';
import { name as appName } from './app.json';

// Enable RTL layout support
I18nManager.allowRTL(true);

AppRegistry.registerComponent(appName, () => App);
