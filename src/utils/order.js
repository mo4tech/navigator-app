// Statuses that mean the driver has already collected the order from the
// vendor, so the leg they are driving is the one towards the customer.
const COLLECTED_STATUSES = ['order_picked_up', 'arrived_at_customer', 'completed'];

/**
 * Every stop the driver moves through, in the order they are visited.
 */
export const getOrderLocations = (order) => {
    const pickup = order.getAttribute('payload.pickup');
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
    const dropoff = order.getAttribute('payload.dropoff');

    return [pickup, ...waypoints, dropoff].filter(Boolean);
};

/**
 * Index of the stop the driver is currently heading to.
 *
 * Fleetbase only advances `payload.current_waypoint` along a multi-waypoint
 * route. On a two-stop vendor -> customer order the waypoints array is empty
 * and the field stays pinned to the pickup for the whole life of the order --
 * measured across 100 live orders it still pointed at the pickup for every
 * order_picked_up and arrived_at_customer one, and for 44 of 45 completed.
 * Following it there sends the driver back to the vendor after collecting, so
 * for those orders the leg is derived from the order status instead.
 */
export const getCurrentDestinationIndex = (order) => {
    const locations = getOrderLocations(order);

    if (locations.length === 0) {
        return -1;
    }

    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
    const currentWaypoint = order.getAttribute('payload.current_waypoint');
    const currentIndex = locations.findIndex((place) => place?.id === currentWaypoint);

    if (waypoints.length === 0) {
        const collected = COLLECTED_STATUSES.includes(order.getAttribute('status'));

        // The backend never moves the field off the pickup by itself, so a value
        // still pointing there once the order has been collected is stale rather
        // than a choice, and the status wins. Any other value was set
        // deliberately -- the driver switching destination writes it through
        // order.setDestination() -- so it is honoured.
        if (currentIndex === 0 && collected) {
            return locations.length - 1;
        }

        if (currentIndex >= 0) {
            return currentIndex;
        }

        return collected ? locations.length - 1 : 0;
    }

    // Unknown waypoint: aim at the final stop. Falling back to the first one
    // would route a driver who is already underway back to the start.
    return currentIndex >= 0 ? currentIndex : locations.length - 1;
};

/**
 * The stop the driver is currently heading to.
 */
export const getCurrentDestination = (order) => {
    const locations = getOrderLocations(order);
    const index = getCurrentDestinationIndex(order);

    return index >= 0 ? locations[index] : undefined;
};

/**
 * The stop the driver is coming from, used as the origin of the drawn route.
 */
export const getPreviousDestination = (order) => {
    const locations = getOrderLocations(order);
    const index = getCurrentDestinationIndex(order);

    return index > 0 ? locations[index - 1] : locations[0];
};
