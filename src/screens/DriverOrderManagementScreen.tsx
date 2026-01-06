import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useCallback, useEffect, useRef } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { Separator, Text, useTheme, XStack, YStack } from 'tamagui';
import AdhocOrderCard from '../components/AdhocOrderCard';
import OrderCard from '../components/OrderCard';
import PastOrderCard from '../components/PastOrderCard';
import Spacer from '../components/Spacer';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import useAppTheme from '../hooks/use-app-theme';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import fireCall from '../utils/call.js';
import { formatDuration, formatMeters } from '../utils/format';
import { translate } from '../utils/localize';

const countStops = (orders = []) =>
    orders.reduce((total, order) => {
        const { pickup, dropoff, waypoints = [] } = order.getAttribute('payload') || {};
        const stops = [pickup, dropoff, ...waypoints].filter(Boolean);
        return total + stops.length;
    }, 0);

const sumDuration = (orders = []) =>
    orders.reduce((total, order) => {
        return total + order.getAttribute('time');
    }, 0);

const sumDistance = (orders = []) =>
    orders.reduce((total, order) => {
        return total + order.getAttribute('distance');
    }, 0);

const REFRESH_NEARBY_ORDERS_MS = 6000 * 5; // 5 mins
const REFRESH_ORDERS_MS = 6000 * 15; // 15 mins
const DriverOrderManagementScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const listenerRef = useRef();
    const { isDarkMode } = useAppTheme();
    const { driver } = useAuth();
    const {
        allActiveOrders,
        currentOrders,
        reloadCurrentOrders,
        reloadActiveOrders,
        isFetchingCurrentOrders,
        nearbyOrders,
        reloadNearbyOrders,
        dismissedOrders,
        setDimissedOrders,
    } = useOrderManager();
    const { listen } = useSocketClusterClient();
    const { addNotificationListener, removeNotificationListener } = useNotification();
    const todayString = format(new Date(), 'EEEE');
    const activeCurrentOrders = currentOrders.filter((order) => !['completed', 'created', 'canceled'].includes(order.getAttribute('status')));
    const stops = countStops(activeCurrentOrders);
    const distance = sumDistance(activeCurrentOrders);
    const duration = sumDuration(activeCurrentOrders);

    useEffect(() => {
        const handlePushNotification = async (notification, action) => {
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            // If any order related push notification comes just reload current orders
            if (typeof id === 'string' && id.startsWith('order_')) {
                reloadCurrentOrders();
            }

            if(typeof type === 'string' && type == 'order_dispatched'){
                fireCall(id)
            }
        };

        addNotificationListener(handlePushNotification);

        return () => {
            removeNotificationListener(handlePushNotification);
        };
    }, [addNotificationListener, removeNotificationListener]);

    useFocusEffect(
        useCallback(() => {
            const handleReloadNearbyOrders = () => {
                reloadNearbyOrders({}, { setLoadingFlag: false });
            };

            const interval = setInterval(handleReloadNearbyOrders, REFRESH_NEARBY_ORDERS_MS);
            return () => clearInterval(interval);
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            const handleReloadCurrentOrders = () => {
                reloadCurrentOrders({}, { setLoadingFlag: false });
            };
            reloadActiveOrders();
            handleReloadCurrentOrders();

            const interval = setInterval(handleReloadCurrentOrders, REFRESH_ORDERS_MS);
            return () => clearInterval(interval);
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            const listenForOrderUpdates = async () => {
                const listener = await listen(`driver.${driver.id}`, ({ event }) => {
                    if (typeof event === 'string' && event === 'order.ready') {
                        reloadCurrentOrders();
                    }
                    if (typeof event === 'string' && event === 'order.ping') {
                        reloadNearbyOrders();
                    }
                });
                if (listener) {
                    listenerRef.current = listener;
                }
            };

            listenForOrderUpdates();

            return () => {
                if (listenerRef.current) {
                    listenerRef.current.stop();
                }
            };
        }, [listen, driver.id])
    );

    const handleAdhocDismissal = useCallback(
        (order) => {
            setDimissedOrders((prevDismissedOrders) => [...prevDismissedOrders, order.id]);
        },
        [setDimissedOrders]
    );

    const handleAdhocAccept = useCallback(() => {
        reloadNearbyOrders();
        reloadCurrentOrders();
    }, [reloadNearbyOrders, reloadCurrentOrders]);

    const renderOrder = ({ item: order }) => {
        const isAdhocOrder = order.getAttribute('adhoc') === true && order.getAttribute('driver_assigned') === null;
        if (isAdhocOrder) {
            if (dismissedOrders.includes(order.id)) return;
            return (
                <YStack px='$2' py='$4'>
                    <AdhocOrderCard
                        order={order}
                        onPress={() => navigation.navigate('OrderModal', { order: order.serialize() })}
                        onDismiss={handleAdhocDismissal}
                        onAccept={handleAdhocAccept}
                    />
                </YStack>
            );
        }

        return (
            <YStack px='$2' py='$4'>
                <OrderCard order={order} onPress={() => navigation.navigate('Order', { order: order.serialize() })} />
            </YStack>
        );
    };

    const ActiveOrders = () => {
        if (!allActiveOrders.length) return;

        return (
            <YStack>
                <YStack px='$1'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold'>
                        {translate('DriverOrderManagementScreen.activeOrders', { count: allActiveOrders.length })}
                    </Text>
                </YStack>
                <YStack>
                    <FlatList
                        data={allActiveOrders}
                        keyExtractor={(order) => order.id.toString()}
                        renderItem={({ item: order }) => (
                            <YStack py='$3'>
                                <PastOrderCard order={order} onPress={() => navigation.navigate('Order', { order: order.serialize() })} />
                            </YStack>
                        )}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                        ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                    />
                </YStack>
            </YStack>
        );
    };

    const NoOrders = () => {
        return (
            <YStack py='$5' px='$3' space='$6' flex={1} height='100%'>
                <YStack alignItems='center'>
                    <XStack alignItems='center' bg='$info' borderWidth={1} borderColor='$infoBorder' space='$2' px='$3' py='$2' borderRadius='$5' width='100%' flexWrap='wrap'>
                        <FontAwesomeIcon icon={faInfoCircle} color={theme['$infoText'].val} />
                        <Text color='$infoText' fontSize={16}>
                            {translate('DriverOrderManagementScreen.noCurrentOrders', { date: format(new Date(), 'yyyy-MM-dd') })}
                        </Text>
                    </XStack>
                </YStack>
                <ActiveOrders />
            </YStack>
        );
    };

    return (
        <YStack flex={1} bg='$surface'>
            <YStack bg='$surface' px='$3' py='$4' borderBottomWidth={1} borderTopWidth={0} borderColor={isDarkMode ? '$borderColor' : '$borderColorWithShadow'}>
                <Text color='$textPrimary' fontSize='$8' fontWeight='bold' mb='$1'>
                    {translate('DriverOrderManagementScreen.ordersTitle', { day: todayString })}
                </Text>
                <XStack space='$2' alignItems='center'>
                    <Text color='$textSecondary' fontSize='$5'>
                        {currentOrders.length} {currentOrders.length > 1 ? translate('DriverOrderManagementScreen.orders') : translate('DriverOrderManagementScreen.order')}
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        •
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        {stops} {stops > 1 ? translate('DriverOrderManagementScreen.stops') : translate('DriverOrderManagementScreen.stop')} {translate('DriverOrderManagementScreen.left')}
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        •
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        {formatDuration(duration)}
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        •
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        {formatMeters(distance)}
                    </Text>
                </XStack>
            </YStack>
            <FlatList
                data={[...nearbyOrders, ...currentOrders]}
                keyExtractor={(order, index) => order.id.toString() + '_' + index}
                renderItem={renderOrder}
                refreshControl={<RefreshControl refreshing={isFetchingCurrentOrders} onRefresh={reloadCurrentOrders} tintColor={theme['$blue-500'].val} />}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                ListFooterComponent={<Spacer height={200} />}
                ListEmptyComponent={<NoOrders />}
            />
        </YStack>
    );
};

export default DriverOrderManagementScreen;
