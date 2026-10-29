import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { YStack, XStack, Text, Avatar, Separator, Button, Spinner, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPhone, faEnvelope, faMessage } from '@fortawesome/free-solid-svg-icons';
import FastImage from 'react-native-fast-image';
import { useChat } from '../contexts/ChatContext';
import { translate } from '../utils/localize';

const OrderCustomerCard = ({ customer }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { createChannelWithCustomer, setCurrentChannel } = useChat();
    const [isOpeningChat, setIsOpeningChat] = useState(false);

    // A dead button is worse than an absent one: if there is nothing to dial or
    // write to, the control is disabled rather than silently doing nothing.
    const canCall = Boolean(customer?.phone);
    const canEmail = Boolean(customer?.email);

    const openExternal = useCallback(async (url: string, unavailableMessage: string) => {
        try {
            await Linking.openURL(url);
        } catch (err) {
            // No dialer or mail client registered for the scheme.
            Alert.alert(translate('OrderCustomerCard.unavailableTitle'), unavailableMessage);
        }
    }, []);

    const handleCall = useCallback(() => {
        return openExternal(`tel:${customer.phone}`, translate('OrderCustomerCard.cannotCall'));
    }, [customer, openExternal]);

    const handleEmail = useCallback(() => {
        return openExternal(`mailto:${customer.email}`, translate('OrderCustomerCard.cannotEmail'));
    }, [customer, openExternal]);

    const handleChat = useCallback(async () => {
        if (isOpeningChat) {
            return;
        }

        setIsOpeningChat(true);

        try {
            const channel = await createChannelWithCustomer(customer);

            if (channel) {
                // ChatChannelScreen renders whatever is in the chat context rather
                // than its own route params, so the channel has to be set there
                // first or the previously opened conversation stays on screen.
                setCurrentChannel(channel);

                // ChatChannel lives inside the chat tab's own stack, so it has to
                // be addressed through that tab rather than by name alone.
                return navigation.navigate('DriverChatTab', { screen: 'ChatChannel', params: { channel } });
            }

            Alert.alert(translate('OrderCustomerCard.unavailableTitle'), translate('OrderCustomerCard.cannotChat'));
        } catch (err) {
            console.warn('Error opening chat with customer:', err);
            Alert.alert(translate('OrderCustomerCard.unavailableTitle'), translate('OrderCustomerCard.cannotChat'));
        } finally {
            setIsOpeningChat(false);
        }
    }, [customer, createChannelWithCustomer, isOpeningChat, navigation, setCurrentChannel]);

    return (
        <YStack space='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
            <YStack px='$3' py='$2'>
                <XStack space='$3'>
                    <YStack justifyContent='center'>
                        <Avatar size={30} circular>
                            <Avatar.Image src={customer.photo_url} />
                        </Avatar>
                    </YStack>
                    <YStack>
                        <Text color='$textPrimary' fontWeight='bold' mb='$1'>
                            {customer.name}
                        </Text>
                        <YStack>
                            {customer.phone && <Text color='$textSecondary'>{customer.phone}</Text>}
                            {customer.email && <Text color='$textSecondary'>{customer.email}</Text>}
                        </YStack>
                    </YStack>
                </XStack>
            </YStack>
            <Separator />
            <YStack px='$3' py='$2'>
                <XStack space='$3'>
                    <Button bg='$info' size='$3' borderWidth={1} borderColor='$infoBorder' onPress={handleCall} disabled={!canCall} opacity={canCall ? 1 : 0.5}>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faPhone} color={theme.infoText.val} />
                        </Button.Icon>
                        <Button.Text color='$infoText'>{translate('OrderCustomerCard.call')}</Button.Text>
                    </Button>
                    <Button bg='$info' size='$3' borderWidth={1} borderColor='$infoBorder' onPress={handleEmail} disabled={!canEmail} opacity={canEmail ? 1 : 0.5}>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faEnvelope} color={theme.infoText.val} />
                        </Button.Icon>
                        <Button.Text color='$infoText'>{translate('OrderCustomerCard.email')}</Button.Text>
                    </Button>
                    <Button bg='$info' size='$3' borderWidth={1} borderColor='$infoBorder' onPress={handleChat} disabled={isOpeningChat} opacity={isOpeningChat ? 0.7 : 1}>
                        <Button.Icon>
                            {isOpeningChat ? <Spinner color='$infoText' /> : <FontAwesomeIcon icon={faMessage} color={theme.infoText.val} />}
                        </Button.Icon>
                        <Button.Text color='$infoText'>{translate('OrderCustomerCard.chat')}</Button.Text>
                    </Button>
                </XStack>
            </YStack>
        </YStack>
    );
};

export default OrderCustomerCard;
