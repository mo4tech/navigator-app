import { YStack } from 'tamagui';
import { restoreFleetbasePlace, getCoordinates } from '../utils/location';
import { last, first } from '../utils';
import useFleetbase from '../hooks/use-fleetbase';
import OpenStreetMapView from './OpenStreetMapView';

const getPlaceCoords = (place) => {
    const [latitude, longitude] = getCoordinates(place);
    return { latitude, longitude };
};

const LiveOrderRoute = ({
    children,
    order,
    zoom = 13,
    width = '100%',
    height = '100%',
    markerSize = 'sm',
    edgePaddingTop = 50,
    edgePaddingBottom = 50,
    edgePaddingLeft = 50,
    edgePaddingRight = 50,
    scrollEnabled = true,
    focusCurrentDestination = false,
    ...props
}) => {
    const { adapter } = useFleetbase();

    // Retrieve attributes from the order
    const pickup = order.getAttribute('payload.pickup');
    const dropoff = order.getAttribute('payload.dropoff');
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];

    // Determine the start waypoint (always use pickup for consistency)
    const startWaypoint = !pickup && waypoints.length > 0 ? waypoints[0] : pickup;
    const start = restoreFleetbasePlace(startWaypoint, adapter);

    // Determine the end waypoint
    const endWaypoint = !dropoff && waypoints.length > 0 && last(waypoints) !== first(waypoints) ? last(waypoints) : dropoff;
    const end = restoreFleetbasePlace(endWaypoint, adapter);

    // Get the coordinates for start and end places
    const origin = getPlaceCoords(start);
    const destination = getPlaceCoords(end);

    // Get only the "middle" waypoints (excluding the first and last ones)
    const middleWaypoints = focusCurrentDestination
        ? []
        : waypoints.slice(1, -1).map((waypoint) => ({
              ...getPlaceCoords(waypoint),
              label: waypoint.address,
          }));

    return (
        <YStack flex={1} position='relative' overflow='hidden' width={width} height={height} {...props}>
            <OpenStreetMapView
                origin={origin}
                destination={destination}
                waypoints={middleWaypoints}
                zoom={zoom}
                width='100%'
                height='100%'
                showRoute={true}
                scrollEnabled={scrollEnabled}
                centerOn='origin'
                borderRadius={props.borderRadius}
            />
            {children}
        </YStack>
    );
};

export default LiveOrderRoute;