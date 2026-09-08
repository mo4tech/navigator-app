import { faBan, faBoxOpen, faCheck, faClock, faFlagCheckered, faLocationDot, faRoute } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useEffect, useRef } from 'react';
import { Modal, Platform, Vibration } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Notification, Notifications } from 'react-native-notifications';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';
import { NEW_ORDER_CHANNEL_ID } from '../contexts/NotificationContext';
import { formatDuration, formatMeters } from '../utils/format';

// Buzz, pause, buzz -- attention-getting without being a continuous alarm.
const VIBRATION_PATTERN = Platform.OS === 'android' ? [0, 400, 200, 400] : [0, 400, 200, 400];
const HAPTIC_OPTIONS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

// Deliberately not Animated.createAnimatedComponent(YStack): Tamagui's style
// props don't survive that wrapper, and the sheet loses its background, radius
// and padding. Animate a plain View and keep Tamagui inside it.

/**
 * Reads a human readable address off a payload place, falling back through the
 * shapes the API returns it in.
 */
const getPlaceLabel = (order, key) => {
    return (
        order?.getAttribute(`payload.${key}.address`) ??
        order?.getAttribute(`payload.${key}.street1`) ??
        order?.getAttribute(`payload.${key}.name`) ??
        null
    );
};

const InfoRow = ({ icon, iconColor, label, value }) => (
    <XStack alignItems='center' gap='$2.5' flex={1}>
        <YStack width={28} height={28} borderRadius={14} bg='$secondary' alignItems='center' justifyContent='center'>
            <FontAwesomeIcon icon={icon} size={12} color={iconColor} />
        </YStack>
        <YStack flex={1}>
            <Text fontSize={10} color='$textSecondary' textTransform='uppercase' letterSpacing={0.5}>
                {label}
            </Text>
            <Text fontSize={13} color='$textPrimary' numberOfLines={1} fontWeight='600'>
                {value}
            </Text>
        </YStack>
    </XStack>
);

const NewOrderAlert = ({ order, queuedCount = 0, onAccept, onDismiss }) => {
    const theme = useTheme();
    const isVisible = !!order;
    const pulse = useSharedValue(1);
    const alertedOrderIdRef = useRef(null);

    // Fire sound and haptics once per order, not on every re-render.
    useEffect(() => {
        if (!isVisible) {
            return;
        }

        const orderId = order?.id;
        if (alertedOrderIdRef.current === orderId) {
            return;
        }
        alertedOrderIdRef.current = orderId;

        Vibration.vibrate(VIBRATION_PATTERN);

        try {
            ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC_OPTIONS);
        } catch (err) {
            // Haptics are a nicety; never let them break the alert.
        }

        try {
            // No audio library is bundled, so a local notification is what gives
            // us an audible cue. Deliberately posted without an `order_` id so it
            // doesn't trip the navigation handler in DriverLayout.
            Notifications.postLocalNotification(
                new Notification({
                    title: 'New Order',
                    body: 'A new order has been assigned to you.',
                    sound: 'default',
                    silent: false,
                    // Android 8+ requires a channel or the post is dropped without
                    // error. Both spellings are sent since the payload key differs
                    // between the library's own posts and FCM-delivered ones.
                    channelId: NEW_ORDER_CHANNEL_ID,
                    android_channel_id: NEW_ORDER_CHANNEL_ID,
                })
            );
        } catch (err) {
            // Sound is best effort.
        }

        return () => Vibration.cancel();
    }, [isVisible, order]);

    // Slow breathing pulse behind the order icon.
    useEffect(() => {
        if (!isVisible) {
            cancelAnimation(pulse);
            pulse.value = 1;
            return;
        }

        pulse.value = withRepeat(withTiming(1.6, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);

        return () => cancelAnimation(pulse);
    }, [isVisible, pulse]);

    // Ripple outward, fading to nothing as it expands.
    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
        opacity: Math.max(0, (1.6 - pulse.value) / 0.6) * 0.5,
    }));

    if (!isVisible) {
        return null;
    }

    const trackingNumber = order.getAttribute('tracking_number.tracking_number');
    const pickup = getPlaceLabel(order, 'pickup');
    const dropoff = getPlaceLabel(order, 'dropoff');
    const distance = order.getAttribute('distance');
    const time = order.getAttribute('time');

    return (
        <Modal transparent animationType='none' visible statusBarTranslucent onRequestClose={onDismiss}>
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
                <Animated.View entering={SlideInDown.springify().damping(18).mass(0.6)} exiting={SlideOutDown.duration(200)}>
                    <YStack
                        bg='$background'
                        borderTopLeftRadius='$6'
                        borderTopRightRadius='$6'
                        borderTopWidth={1}
                        borderColor='$borderColor'
                        pb='$6'
                        pt='$4'
                        px='$4'
                        gap='$4'
                    >
                    {/* grab handle */}
                    <YStack alignSelf='center' width={40} height={4} borderRadius={2} bg='$borderColor' />

                    <XStack alignItems='center' gap='$3'>
                        <YStack width={52} height={52} alignItems='center' justifyContent='center'>
                            <Animated.View
                                style={[
                                    { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: theme['$successBorder']?.val ?? '#16a34a' },
                                    pulseStyle,
                                ]}
                            />
                            <YStack width={42} height={42} borderRadius={21} bg='$success' alignItems='center' justifyContent='center'>
                                <FontAwesomeIcon icon={faBoxOpen} size={18} color={theme['$successText'].val} />
                            </YStack>
                        </YStack>
                        <YStack flex={1}>
                            <Text fontSize={19} fontWeight='800' color='$textPrimary'>
                                New Order
                            </Text>
                            <Text fontSize={12} color='$textSecondary' numberOfLines={1}>
                                {trackingNumber ? trackingNumber : 'Assigned to you just now'}
                            </Text>
                        </YStack>
                        {queuedCount > 0 && (
                            <YStack bg='$secondary' borderWidth={1} borderColor='$borderColor' borderRadius='$10' px='$2.5' py='$1'>
                                <Text fontSize={11} fontWeight='700' color='$textSecondary'>
                                    +{queuedCount} more
                                </Text>
                            </YStack>
                        )}
                    </XStack>

                    <YStack gap='$3' bg='$secondary' borderRadius='$4' borderWidth={1} borderColor='$borderColor' p='$3'>
                        {pickup && <InfoRow icon={faLocationDot} iconColor={theme['$textPrimary'].val} label='Pickup' value={pickup} />}
                        {dropoff && <InfoRow icon={faFlagCheckered} iconColor={theme['$textPrimary'].val} label='Dropoff' value={dropoff} />}
                        {!pickup && !dropoff && (
                            <Text fontSize={13} color='$textSecondary'>
                                Tap accept to view the full order details.
                            </Text>
                        )}
                    </YStack>

                    {(distance || time) && (
                        <XStack gap='$3'>
                            {!!distance && <InfoRow icon={faRoute} iconColor={theme['$textPrimary'].val} label='Distance' value={formatMeters(distance)} />}
                            {!!time && <InfoRow icon={faClock} iconColor={theme['$textPrimary'].val} label='Duration' value={formatDuration(time)} />}
                        </XStack>
                    )}

                    <XStack gap='$3' pt='$1'>
                        <YStack flex={1}>
                            <Button size='$5' onPress={onDismiss} bg='$error' borderColor='$errorBorder' borderWidth={1} pressStyle={{ opacity: 0.85, scale: 0.98 }}>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faBan} color={theme['$errorText'].val} />
                                </Button.Icon>
                                <Button.Text color='$errorText' fontWeight='700'>
                                    Dismiss Order
                                </Button.Text>
                            </Button>
                        </YStack>
                        <YStack flex={1.4}>
                            <Button size='$5' onPress={onAccept} bg='$success' borderColor='$successBorder' borderWidth={1} pressStyle={{ opacity: 0.85, scale: 0.98 }}>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faCheck} color={theme['$successText'].val} />
                                </Button.Icon>
                                <Button.Text color='$successText' fontWeight='700'>
                                    Accept Order
                                </Button.Text>
                            </Button>
                        </YStack>
                        </XStack>
                    </YStack>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

export default NewOrderAlert;
