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
    // When true, the route reflects the driver's active leg: the destination follows
    // `payload.current_waypoint` (which the backend advances as the driver updates the
    // order status), so before pickup it points at the vendor and after pickup at the customer.
    followCurrentWaypoint = false,
    ...props
}) => {
    const { adapter } = useFleetbase();

    // Retrieve attributes from the order
    const pickup = order.getAttribute('payload.pickup');
    const dropoff = order.getAttribute('payload.dropoff');
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];

    let startWaypoint;
    let endWaypoint;
    let middleWaypointsSource = [];

    if (followCurrentWaypoint) {
        // Ordered list of every stop the driver moves through.
        const locations = [pickup, ...waypoints, dropoff].filter(Boolean);
        const currentWaypoint = order.getAttribute('payload.current_waypoint');
        const currentIndex = locations.findIndex((place) => place?.id === currentWaypoint);

        // Destination = the leg the driver is currently heading to (fallback to final stop).
        endWaypoint = currentIndex >= 0 ? locations[currentIndex] : last(locations);
        // Origin = the previous stop (e.g. the vendor once the order is picked up).
        startWaypoint = currentIndex > 0 ? locations[currentIndex - 1] : first(locations);
    } else {
        // Determine the start waypoint (always use pickup for consistency)
        startWaypoint = !pickup && waypoints.length > 0 ? waypoints[0] : pickup;

        // Determine the end waypoint
        endWaypoint = !dropoff && waypoints.length > 0 && last(waypoints) !== first(waypoints) ? last(waypoints) : dropoff;

        // Get only the "middle" waypoints (excluding the first and last ones)
        middleWaypointsSource = focusCurrentDestination ? [] : waypoints.slice(1, -1);
    }

    const start = restoreFleetbasePlace(startWaypoint, adapter);
    const end = restoreFleetbasePlace(endWaypoint, adapter);

    // Get the coordinates for start and end places
    const origin = getPlaceCoords(start);
    const destination = getPlaceCoords(end);

    const middleWaypoints = middleWaypointsSource.map((waypoint) => ({
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