import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, Platform } from 'react-native';
import RNCallKeep from 'react-native-callkeep';

const callerName = "New Order";

// Emitted when the driver answers the incoming call for an order. The payload is
// the order id, since that's what is used as the call UUID.
export const ORDER_CALL_ANSWERED = 'order:call-answered';

// An order should be able to ring again if it's re-dispatched, so the dedupe
// record expires rather than living forever.
const CALL_DEDUPE_PREFIX = 'callkeep:order:';
const CALL_DEDUPE_TTL_MS = 5 * 60 * 1000;

// Track initialization state
let isCallKeepInitialized = false;
let listenersSetUp = false;

const initializeCallKeep = async () => {
    if (isCallKeepInitialized) return true;

    try {
        const options = {
            ios: {
                appName: 'Navigator',
                supportsVideo: false,
            },
            android: {
                alertTitle: 'Permissions required',
                alertDescription: 'This application needs to access your phone accounts',
                cancelButton: 'Cancel',
                okButton: 'OK',
                additionalPermissions: [],
                selfManaged: false,
                // Required for release builds
                foregroundService: {
                    channelId: 'io.fleetbase.navigator.call',
                    channelName: 'Incoming Calls',
                    notificationTitle: 'Incoming call',
                    notificationIcon: 'ic_notification',
                },
            },
        };

        await RNCallKeep.setup(options);

        // Register phone account with Android Telecom - required for release builds
        if (Platform.OS === 'android') {
            RNCallKeep.registerPhoneAccount(options);
            RNCallKeep.registerAndroidEvents();
            RNCallKeep.setAvailable(true);
        }

        isCallKeepInitialized = true;
        return true;
    } catch (error) {
        console.error('Error initializing CallKeep:', error);
        return false;
    }
};

const setupCallKeepListeners = () => {
    if (listenersSetUp) return;

    try {
        if (!RNCallKeep || typeof RNCallKeep.addEventListener !== 'function') {
            console.warn('CallKeep not properly initialized');
            return;
        }

        // Driver chose to view the order: bring the app forward and let the app
        // layer navigate to the order the call was raised for.
        RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
            try {
                RNCallKeep.endCall(callUUID);
                RNCallKeep.backToForeground();
                DeviceEventEmitter.emit(ORDER_CALL_ANSWERED, callUUID);
            } catch (error) {
                console.error('Error in answerCall handler:', error);
            }
        });

        // Driver ignored the order, or the call was ended programmatically after
        // being answered. Either way the app must not pull itself to the front.
        RNCallKeep.addEventListener('endCall', () => {});

        listenersSetUp = true;
    } catch (error) {
        console.error('Error setting up CallKeep listeners:', error);
    }
};

const fireCall = async (orderId) => {
    try {
        if (!orderId) {
            console.warn('fireCall called without orderId');
            return;
        }

        // Validate CallKeep is available
        if (!RNCallKeep || typeof RNCallKeep.displayIncomingCall !== 'function') {
            console.error('CallKeep is not properly initialized or not available');
            return;
        }

        // Initialize CallKeep first (this sets up the native module's internal state)
        const initialized = await initializeCallKeep();
        if (!initialized) {
            console.error('Failed to initialize CallKeep');
            return;
        }

        // Set up listeners once
        setupCallKeepListeners();

        // Skip if this order already rang recently, so the socket and push
        // channels don't ring twice for the same dispatch.
        const dedupeKey = `${CALL_DEDUPE_PREFIX}${orderId}`;
        const lastRangAt = parseInt(await AsyncStorage.getItem(dedupeKey), 10);
        const now = Date.now();

        if (!Number.isNaN(lastRangAt) && now - lastRangAt < CALL_DEDUPE_TTL_MS) {
            return;
        }

        await AsyncStorage.setItem(dedupeKey, String(now));

        // Add a small delay to ensure CallKeep is fully ready
        if (Platform.OS === 'android') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        try {
            RNCallKeep.displayIncomingCall(orderId, callerName, callerName);
        } catch (displayError) {
            console.error('Error displaying incoming call:', displayError);
            // Don't throw - just log the error so app doesn't crash
        }
    } catch (error) {
        console.error('Error in fireCall:', error);
        // Don't re-throw - we want to fail gracefully
    }
};

export default fireCall;