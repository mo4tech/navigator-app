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

// Fleetbase sends OrderAssigned when a driver is assigned to a non-adhoc order,
// and OrderDispatched when an adhoc order is broadcast. Both mean "new work for
// this driver". Matched loosely on purpose: the exact payload string differs
// between notification classes, and an exact-match miss fails silently -- while
// completed/canceled/failed still won't match, so they stay quiet.
const isNewOrderNotification = (type) => {
  const value = String(type ?? '').toLowerCase();

  return value.includes('assign') || value.includes('dispatch');
};

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("Message handled in the background!", remoteMessage);

  const orderId = String(remoteMessage.data.id);
  const orderType = remoteMessage.data.type;

  if (isNewOrderNotification(orderType)) {
    fireCall(orderId);
  }

  return Promise.resolve();  // Ensure the function completes
});

messaging().onMessage(async (remoteMessage) => {
  console.log("Message handled in the foreground!", remoteMessage);

  const orderId = String(remoteMessage.data.id);
  const orderType = remoteMessage.data.type;

  if (isNewOrderNotification(orderType)) {
    fireCall(orderId);
  }
});

AppRegistry.registerComponent(appName, () => App);
