// index.native.tsx
import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import App from './App';
import { name as appName } from './app.json';
import fireCall from './src/utils/call.js';

// Enable RTL layout support
// I18nManager.allowRTL(true);
// I18nManager.forceRTL(true);

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("Message handled in the background!", remoteMessage);

  const orderId = String(remoteMessage.data.id);
  const orderType = remoteMessage.data.type;

  if (orderType === 'order_dispatched') {
    fireCall(orderId);
  }

  return Promise.resolve();  // Ensure the function completes
});

AppRegistry.registerComponent(appName, () => App);
