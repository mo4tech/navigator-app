import { Pressable } from 'react-native';
import { YStack } from 'tamagui';
import { restoreFleetbasePlace, getCoordinates } from '../utils/location';
import useFleetbase from '../hooks/use-fleetbase';
import OpenStreetMapView from './OpenStreetMapView';

const PlaceMapView = ({ place: _place, width = '100%', height = 200, markerSize = 'md', zoom = 13, onPress, mapViewProps = {}, ...props }) => {
    const { adapter } = useFleetbase();
    const place = restoreFleetbasePlace(_place, adapter);
    const [latitude, longitude] = getCoordinates(place);

    const origin = { latitude, longitude };

    return (
        <Pressable onPress={onPress} style={{ flex: 1 }}>
            <YStack position='relative' overflow='hidden' borderRadius='$4' width={width} height={height} {...props}>
                <OpenStreetMapView
                    origin={origin}
                    zoom={zoom}
                    width='100%'
                    height='100%'
                    showRoute={false}
                    scrollEnabled={false}
                />
            </YStack>
        </Pressable>
    );
};

export default PlaceMapView;