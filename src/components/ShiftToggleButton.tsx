import { faCircleStop, faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { Button, Spinner, Text, XStack, YStack, useTheme } from 'tamagui';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { useLocation } from '../contexts/LocationContext';
import { useStorage } from '../hooks/use-storage';
import { SHIFT_ACTIVE_KEY, SHIFT_EVENT, buildSessionEvent, flushSessionQueue, getQueuedSessionEventCount, sendSessionEvent } from '../utils/driver-session';

// A slow fix must never hold up the button -- an event without coordinates is
// far better than no event at all.
const LOCATION_TIMEOUT_SECONDS = 5;

const ShiftToggleButton = () => {
    const theme = useTheme();
    const { driver } = useAuth();
    const { resolveConnectionConfig } = useConfig();
    const { location } = useLocation();
    const [isOnShift, setIsOnShift] = useStorage(SHIFT_ACTIVE_KEY, false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [queuedCount, setQueuedCount] = useState(getQueuedSessionEventCount());
    const permissionPromptedRef = useRef(false);

    const backendUrl = resolveConnectionConfig('BACKEND_URL');
    const driverId = driver?.id;

    // Retry anything queued from an earlier failure, on mount and whenever the
    // driver returns to the app -- the closest signal to "connectivity is back"
    // without adding a dependency.
    useEffect(() => {
        const retryQueued = async () => {
            if (getQueuedSessionEventCount() === 0) {
                return;
            }

            await flushSessionQueue(backendUrl);
            setQueuedCount(getQueuedSessionEventCount());
        };

        retryQueued();

        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                retryQueued();
            }
        });

        return () => subscription.remove();
    }, [backendUrl]);

    const resolveCoords = useCallback(async () => {
        try {
            const position = await BackgroundGeolocation.getCurrentPosition({
                timeout: LOCATION_TIMEOUT_SECONDS,
                samples: 1,
                maximumAge: 10000,
                desiredAccuracy: 10,
                extras: { event: 'shiftToggle' },
            });

            return position?.coords ?? null;
        } catch (err) {
            // Denied permission or no fix in time. Fall back to the last known
            // position, and failing that send the event without coordinates.
            const message = String(err?.message ?? err).toLowerCase();

            if (message.includes('permission') && !permissionPromptedRef.current) {
                permissionPromptedRef.current = true;
                Alert.alert(
                    'Location is off',
                    'Your shift was recorded, but without a location. Turn on location access so your shift start and end are logged with where you are.'
                );
            }

            return location?.coords ?? null;
        }
    }, [location]);

    const handleToggle = useCallback(async () => {
        if (isSubmitting || !driverId) {
            return;
        }

        setIsSubmitting(true);

        const event = isOnShift ? SHIFT_EVENT.END : SHIFT_EVENT.START;

        try {
            const coords = await resolveCoords();
            const payload = buildSessionEvent({ driverId, event, coords });

            // Flip locally first: the driver's shift state is theirs, and must
            // not depend on the request getting through.
            setIsOnShift(!isOnShift);

            const { delivered, dropped, stored } = await sendSessionEvent(backendUrl, payload);
            setQueuedCount(getQueuedSessionEventCount());

            if (dropped) {
                // Rejected outright, so it will never be retried -- the driver
                // needs to know the record only exists on their phone.
                Alert.alert(
                    isOnShift ? 'Shift ended on this phone' : 'Shift started on this phone',
                    'The server would not accept this change, so it has not been recorded. Please let dispatch know.'
                );
            } else if (!delivered) {
                Alert.alert(
                    isOnShift ? 'Shift ended' : 'Shift started',
                    stored
                        ? 'Saved on your phone and will be sent automatically.'
                        : 'Your phone could not save this change, so it may not reach dispatch. Please let them know.'
                );
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [backendUrl, driverId, isOnShift, isSubmitting, resolveCoords, setIsOnShift]);

    if (!driverId) {
        return null;
    }

    return (
        <YStack gap='$2'>
            <Button
                size='$5'
                onPress={handleToggle}
                disabled={isSubmitting}
                opacity={isSubmitting ? 0.7 : 1}
                bg={isOnShift ? '$error' : '$success'}
                borderColor={isOnShift ? '$errorBorder' : '$successBorder'}
                borderWidth={1}
                pressStyle={{ opacity: 0.85, scale: 0.99 }}
            >
                <Button.Icon>
                    {isSubmitting ? (
                        <Spinner color={isOnShift ? '$errorText' : '$successText'} />
                    ) : (
                        <FontAwesomeIcon
                            icon={isOnShift ? faCircleStop : faPlay}
                            color={isOnShift ? theme['$errorText'].val : theme['$successText'].val}
                        />
                    )}
                </Button.Icon>
                <Button.Text color={isOnShift ? '$errorText' : '$successText'} fontWeight='700'>
                    {isOnShift ? 'End Shift' : 'Start Shift'}
                </Button.Text>
            </Button>

            {queuedCount > 0 && (
                <XStack justifyContent='center'>
                    <Text fontSize={12} color='$textSecondary'>
                        {queuedCount} shift {queuedCount === 1 ? 'update' : 'updates'} waiting to send
                    </Text>
                </XStack>
            )}
        </YStack>
    );
};

export default ShiftToggleButton;
