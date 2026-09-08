import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, View } from 'react-native';
import NewOrderAlert from '../components/NewOrderAlert';
import { useNavigation } from '@react-navigation/native';
import { later } from '../utils';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import useFleetbase from '../hooks/use-fleetbase';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import fireCall, { ORDER_CALL_ANSWERED } from '../utils/call.js';

// How often to ask Fleetbase directly whether anything new has been assigned.
// This is the fallback for when the socket is unavailable, which happens
// whenever the connection is dropped in the background.
const POLL_NEW_ORDERS_MS = 30000;

const getCurrentScreen = (tabNavigation) => {
    const tabState = tabNavigation.getState?.();
    const currentTabRoute = tabState?.routes?.[tabState.index];
    const stackState = currentTabRoute?.state;
    const currentScreen = stackState?.routes?.[stackState.index];

    return {
        tabName: currentTabRoute?.name,
        screenName: currentScreen?.name,
        screenParams: currentScreen?.params,
    };
};

const DriverLayout = ({ children, state, descriptors, navigation: tabNavigation }) => {
    const navigation = useNavigation();
    const { fleetbase } = useFleetbase();
    const { driver } = useAuth();
    const { getChannel } = useChat();
    const { addNotificationListener, removeNotificationListener } = useNotification();
    const { reloadActiveOrders, reloadCurrentOrders, reloadNearbyOrders } = useOrderManager();
    const { listen } = useSocketClusterClient();
    const orderListenerRef = useRef<Array<{ stop: () => void } | null> | null>(null);
    const seenOrderIdsRef = useRef<Set<string> | null>(null);
    const driverId = driver?.id;
    // A queue rather than a single value: two orders can land in the same poll,
    // and overwriting would silently drop the first -- it's already been marked
    // as seen, so nothing would ever alert about it again.
    const [incomingOrders, setIncomingOrders] = useState([]);
    const incomingOrder = incomingOrders[0] ?? null;

    // Alerts the driver about a newly assigned order. While the app is in front
    // this is the in-app sheet; otherwise fall back to the incoming-call screen,
    // which is the only thing that surfaces from the background.
    const alertNewOrder = useCallback(
        async (orderId) => {
            if (!orderId) {
                return;
            }

            if (AppState.currentState !== 'active') {
                fireCall(orderId);
                return;
            }

            try {
                const order = await fleetbase.orders.findRecord(orderId);
                setIncomingOrders((queued) => (queued.some((queuedOrder) => queuedOrder?.id === order?.id) ? queued : [...queued, order]));
            } catch (err) {
                console.warn('Error loading order for alert:', err);
                fireCall(orderId);
            }
        },
        [fleetbase]
    );

    const handleDismissIncomingOrder = useCallback(() => {
        setIncomingOrders((queued) => queued.slice(1));
    }, []);

    // Opens the order the driver was alerted about, from wherever they currently are.
    const openOrder = useCallback(
        async (id) => {
            if (!fleetbase || !id) {
                return;
            }

            try {
                const order = await fleetbase.orders.findRecord(id);
                const orderId = order.id;
                const { tabName, screenName, screenParams } = getCurrentScreen(tabNavigation);

                const isOnDriverTaskTab = tabName === 'DriverTaskTab';
                const isOrderModalOpen = screenName === 'OrderModal' && screenParams?.order?.id === orderId;

                if (!isOnDriverTaskTab) {
                    tabNavigation.navigate('DriverTaskTab', { screen: 'DriverOrderManagement' });
                }

                if (!isOrderModalOpen) {
                    later(() => {
                        tabNavigation.navigate('DriverTaskTab', {
                            screen: 'OrderModal',
                            params: { order: order.serialize() },
                        });
                    }, 100);
                } else {
                    console.log('[Navigation] Order modal already open for this order.');
                }
            } catch (err) {
                console.warn('Error navigating to order:', err);
            }
        },
        [fleetbase, tabNavigation]
    );

    const handleAcceptIncomingOrder = useCallback(() => {
        const orderId = incomingOrder?.id;
        setIncomingOrders((queued) => queued.slice(1));
        openOrder(orderId);
    }, [incomingOrder, openOrder]);

    useEffect(() => {
        if (!fleetbase) {
            return;
        }

        const handlePushNotification = async (notification, action) => {
            console.log('[Notification]', notification);
            console.log('[Notification #action]', action);
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            if (type === 'chat_message_received' && action === 'opened') {
                try {
                    const chatChannelId = payload.channel;
                    const channel = await getChannel(chatChannelId);
                    const { tabName, screenName, screenParams } = getCurrentScreen(tabNavigation);

                    const isOnDriverChatTab = tabName === 'DriverChatTab';
                    const isOnSameChatChannel = screenName === 'ChatChannel' && screenParams?.channel?.uuid === chatChannelId;

                    if (!isOnDriverChatTab) {
                        tabNavigation.navigate('DriverChatTab', { screen: 'ChatList' });
                    }

                    if (!isOnSameChatChannel) {
                        later(() => {
                            tabNavigation.navigate('DriverChatTab', {
                                screen: 'ChatChannel',
                                params: { channel },
                            });
                        }, 100);
                    } else {
                        console.log('[Navigation] Chat channel already open for this message.');
                    }
                } catch (err) {
                    console.warn('Error trying to open chat channel:', err);
                }
            }

            if (typeof id === 'string' && id.startsWith('order_')) {
                // Reload active orders
                reloadActiveOrders();
                openOrder(id);
            }
        };

        addNotificationListener(handlePushNotification);

        return () => {
            removeNotificationListener(handlePushNotification);
        };
    }, [addNotificationListener, removeNotificationListener, fleetbase, tabNavigation, navigation, openOrder]);

    // "View Order" from the incoming call screen. Ignoring the call emits nothing,
    // so the driver is left where they were.
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener(ORDER_CALL_ANSWERED, (orderId) => {
            reloadActiveOrders();
            openOrder(orderId);
        });

        return () => subscription.remove();
    }, [openOrder, reloadActiveOrders]);

    // Listen for order events app-wide rather than only while the orders screen is
    // focused, so a dispatch alerts the driver on any tab.
    useEffect(() => {
        if (!driverId) {
            return;
        }

        let cancelled = false;

        const handleOrderEvent = ({ event, data }) => {
            if (event === 'order.ready') {
                reloadCurrentOrders();
            }

            if (event === 'order.ping') {
                reloadNearbyOrders();
            }

            // 'order.dispatched' is the adhoc broadcast; 'order.assigned' is a
            // driver being assigned directly. Either is new work for this driver.
            if (event === 'order.dispatched' || event === 'order.assigned') {
                const orderId = data?.id;
                if (orderId) {
                    // Record it so the poller doesn't alert about it a second time.
                    seenOrderIdsRef.current?.add(orderId);
                    alertNewOrder(orderId);
                }
                reloadCurrentOrders();
            }
        };

        const listenForOrderUpdates = async () => {
            // Order lifecycle events are broadcast on the `driverAssigned` relationship
            // channel, while `driver` carries location events. Listen to both so a
            // dispatch is picked up regardless of which channel it arrives on.
            const listeners = await Promise.all([
                listen(`driverAssigned.${driverId}`, handleOrderEvent),
                listen(`driver.${driverId}`, handleOrderEvent),
            ]);

            if (cancelled) {
                listeners.forEach((listener) => listener?.stop?.());
                return;
            }

            orderListenerRef.current = listeners;
        };

        listenForOrderUpdates();

        return () => {
            cancelled = true;
            orderListenerRef.current?.forEach((listener) => listener?.stop?.());
            orderListenerRef.current = null;
        };
    }, [driverId, listen, reloadCurrentOrders, reloadNearbyOrders, alertNewOrder]);

    // Ask Fleetbase directly for orders assigned to this driver and alert on
    // anything that wasn't there before. The socket delivers faster when it's
    // connected, but this doesn't depend on it -- or on push being configured
    // server side -- so an assignment is still caught either way. fireCall
    // dedupes, so an order arriving on both paths only rings once.
    useEffect(() => {
        if (!fleetbase || !driverId) {
            return;
        }

        let cancelled = false;

        const pollForNewOrders = async () => {
            try {
                const orders = await fleetbase.orders.query({ driver_assigned: driverId, limit: 20, sort: '-created_at' });

                if (cancelled || !Array.isArray(orders)) {
                    return;
                }

                const orderIds = orders.map((order) => order?.id).filter(Boolean);

                // The first poll records what already exists so the driver isn't
                // called about orders they've had all along.
                if (seenOrderIdsRef.current === null) {
                    seenOrderIdsRef.current = new Set(orderIds);
                    return;
                }

                const newOrderIds = orderIds.filter((orderId) => !seenOrderIdsRef.current.has(orderId));

                newOrderIds.forEach((orderId) => {
                    seenOrderIdsRef.current.add(orderId);
                    alertNewOrder(orderId);
                });

                if (newOrderIds.length > 0) {
                    reloadCurrentOrders();
                }
            } catch (err) {
                console.warn('Error polling for new orders:', err);
            }
        };

        pollForNewOrders();
        const interval = setInterval(pollForNewOrders, POLL_NEW_ORDERS_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [fleetbase, driverId, reloadCurrentOrders, alertNewOrder]);

    return (
        <View style={{ width: '100%', height: '100%', flex: 1 }}>
            {children}
            <NewOrderAlert
                order={incomingOrder}
                queuedCount={Math.max(incomingOrders.length - 1, 0)}
                onAccept={handleAcceptIncomingOrder}
                onDismiss={handleDismissIncomingOrder}
            />
        </View>
    );
};

export default DriverLayout;
