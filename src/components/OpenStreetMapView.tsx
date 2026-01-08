import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { YStack } from 'tamagui';

interface Coordinate {
    latitude: number;
    longitude: number;
}

interface Waypoint extends Coordinate {
    label?: string;
}

interface OpenStreetMapViewProps {
    origin?: Coordinate | null;
    destination?: Coordinate | null;
    waypoints?: Waypoint[];
    width?: number | string;
    height?: number | string;
    zoom?: number;
    showRoute?: boolean;
    scrollEnabled?: boolean;
    markerColor?: string;
    routeColor?: string;
    centerOn?: 'origin' | 'destination' | 'fitAll';
    onPress?: () => void;
    [key: string]: any;
}

// Helper to check if coordinate is valid
const isValidCoord = (coord: Coordinate | null | undefined): coord is Coordinate => {
    return (
        coord != null &&
        typeof coord.latitude === 'number' &&
        typeof coord.longitude === 'number' &&
        !isNaN(coord.latitude) &&
        !isNaN(coord.longitude) &&
        isFinite(coord.latitude) &&
        isFinite(coord.longitude)
    );
};

const OpenStreetMapView: React.FC<OpenStreetMapViewProps> = ({
    origin,
    destination,
    waypoints = [],
    width = '100%',
    height = 200,
    zoom = 13,
    showRoute = true,
    scrollEnabled = true,
    markerColor = '#3b82f6',
    routeColor = '#3b82f6',
    centerOn = 'destination',
    onPress,
    ...props
}) => {
    const htmlContent = useMemo(() => {
        // Default fallback coordinates (Singapore)
        const DEFAULT_LAT = 1.369;
        const DEFAULT_LNG = 103.8864;

        // Calculate center point based on centerOn prop
        let centerLat = DEFAULT_LAT;
        let centerLng = DEFAULT_LNG;
        const allPoints: Coordinate[] = [];

        if (isValidCoord(origin)) {
            allPoints.push(origin);
        }
        if (isValidCoord(destination)) {
            allPoints.push(destination);
        }
        waypoints.forEach((wp) => {
            if (isValidCoord(wp)) {
                allPoints.push(wp);
            }
        });

        // Determine center based on centerOn prop
        if (centerOn === 'destination' && isValidCoord(destination)) {
            centerLat = destination.latitude;
            centerLng = destination.longitude;
        } else if (centerOn === 'origin' && isValidCoord(origin)) {
            centerLat = origin.latitude;
            centerLng = origin.longitude;
        } else if (centerOn === 'fitAll' && allPoints.length > 0) {
            // Calculate center of all points (fitAll will also fitBounds later)
            centerLat = allPoints.reduce((sum, p) => sum + p.latitude, 0) / allPoints.length;
            centerLng = allPoints.reduce((sum, p) => sum + p.longitude, 0) / allPoints.length;
        } else if (allPoints.length > 0) {
            // Fallback: use first available point
            centerLat = allPoints[0].latitude;
            centerLng = allPoints[0].longitude;
        }

        // Build markers JavaScript
        const markersJs = allPoints
            .map(
                (point) => `
            L.circleMarker([${point.latitude}, ${point.longitude}], {
                radius: 8,
                fillColor: '${markerColor}',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).addTo(map);
        `
            )
            .join('\n');

        // Build route fetching JavaScript using OSRM (free routing service)
        let routeJs = '';
        if (showRoute && isValidCoord(origin) && isValidCoord(destination)) {
            const waypointCoords = waypoints
                .filter((wp) => isValidCoord(wp))
                .map((wp) => `${wp.longitude},${wp.latitude}`)
                .join(';');

            const routeCoords = waypointCoords
                ? `${origin.longitude},${origin.latitude};${waypointCoords};${destination.longitude},${destination.latitude}`
                : `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;

            routeJs = `
                fetch('https://router.project-osrm.org/route/v1/driving/${routeCoords}?overview=full&geometries=geojson')
                    .then(response => response.json())
                    .then(data => {
                        if (data.routes && data.routes[0]) {
                            const routeCoords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                            const routeLine = L.polyline(routeCoords, {
                                color: '${routeColor}',
                                weight: 4,
                                opacity: 0.8
                            }).addTo(map);
                            map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
                        }
                    })
                    .catch(err => {
                        console.log('Route fetch error:', err);
                        // If routing fails, just fit to markers
                        if (markers.length > 0) {
                            const group = L.featureGroup(markers);
                            map.fitBounds(group.getBounds(), { padding: [30, 30] });
                        }
                    });
            `;
        }

        // Fit bounds JavaScript - only when centerOn is 'fitAll' and not showing route
        let fitBoundsJs = '';
        if (centerOn === 'fitAll' && allPoints.length > 1 && !showRoute) {
            const boundsPoints = allPoints.map((p) => `[${p.latitude}, ${p.longitude}]`).join(',');
            fitBoundsJs = `
                map.fitBounds([${boundsPoints}], { padding: [30, 30] });
            `;
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>
                    * { margin: 0; padding: 0; }
                    html, body, #map {
                        width: 100%;
                        height: 100%;
                        background: #e5e5e5;
                    }
                    .leaflet-control-attribution {
                        font-size: 8px !important;
                    }
                </style>
            </head>
            <body>
                <div id="map"></div>
                <script>
                    var map = L.map('map', {
                        zoomControl: false,
                        attributionControl: true,
                        dragging: ${scrollEnabled},
                        touchZoom: ${scrollEnabled},
                        scrollWheelZoom: ${scrollEnabled},
                        doubleClickZoom: ${scrollEnabled}
                    }).setView([${centerLat || 0}, ${centerLng || 0}], ${zoom});

                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap'
                    }).addTo(map);

                    var markers = [];
                    ${markersJs}
                    ${routeJs}
                    ${fitBoundsJs}

                    ${
                        onPress
                            ? `
                        map.on('click', function() {
                            window.ReactNativeWebView.postMessage('mapPressed');
                        });
                    `
                            : ''
                    }
                </script>
            </body>
            </html>
        `;
    }, [origin, destination, waypoints, zoom, showRoute, scrollEnabled, markerColor, routeColor, centerOn]);

    const handleMessage = (event: any) => {
        if (event.nativeEvent.data === 'mapPressed' && onPress) {
            onPress();
        }
    };

    return (
        <YStack width={width} height={height} overflow='hidden' {...props}>
            <WebView
                source={{ html: htmlContent }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled={scrollEnabled}
                bounces={false}
                onMessage={handleMessage}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                scalesPageToFit={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                {...(Platform.OS === 'android' && { overScrollMode: 'never' })}
            />
        </YStack>
    );
};

export default OpenStreetMapView;