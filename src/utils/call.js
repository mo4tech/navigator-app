import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import RNCallKeep from 'react-native-callkeep';

const callerName = "New Order";

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

        RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
            try {
                RNCallKeep.endCall(callUUID);
                RNCallKeep.backToForeground();
            } catch (error) {
                console.error('Error in answerCall handler:', error);
            }
        });

        RNCallKeep.addEventListener('endCall', () => {
            try {
                RNCallKeep.backToForeground();
            } catch (error) {
                console.error('Error in endCall handler:', error);
            }
        });

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

        const order_id = await AsyncStorage.getItem(orderId);

        if (order_id === null) {
            await AsyncStorage.setItem(orderId, orderId);

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
        }
    } catch (error) {
        console.error('Error in fireCall:', error);
        // Don't re-throw - we want to fail gracefully
    }
};

export default fireCall;