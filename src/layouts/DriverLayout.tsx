import { useCallback, useEffect, useRef } from 'react';
import { DeviceEventEmitter, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { later } from '../utils';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import useFleetbase from '../hooks/use-fleetbase';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import fireCall, { ORDER_CALL_ANSWERED } from '../utils/call.js';

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
        if (!driver) {
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

            if (event === 'order.dispatched') {
                const orderId = data?.id;
                if (orderId) {
                    fireCall(orderId);
                }
                reloadCurrentOrders();
            }
        };

        const listenForOrderUpdates = async () => {
            // Order lifecycle events are broadcast on the `driverAssigned` relationship
            // channel, while `driver` carries location events. Listen to both so a
            // dispatch is picked up regardless of which channel it arrives on.
            const listeners = await Promise.all([
                listen(`driverAssigned.${driver.id}`, handleOrderEvent),
                listen(`driver.${driver.id}`, handleOrderEvent),
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
    }, [driver, listen, reloadCurrentOrders, reloadNearbyOrders]);

    return <View style={{ width: '100%', height: '100%', flex: 1 }}>{children}</View>;
};

export default DriverLayout;
