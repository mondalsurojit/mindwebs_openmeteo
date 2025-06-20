import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useMap } from 'react-leaflet';
import { CircleMarker, Popup } from 'react-leaflet';
import { MapPin, Thermometer, Droplets, Wind, Eye, Gauge, CloudRain, Wind as WindIcon } from 'lucide-react';

import {
    selectSelectedCities, selectShowZWS, selectSelectedZomatoStationId, setSelectedZomatoStationId,
    selectVisibleCityStations, selectHiddenCities
} from '../../redux/slices/zomatoSlice';

const ZWSOverlay = () => {
    const map = useMap();
    const dispatch = useDispatch();
    const [visibleMarkers, setVisibleMarkers] = useState([]);

    // Redux selectors
    const selectedCities = useSelector(selectSelectedCities);
    const hiddenCities = useSelector(selectHiddenCities);
    const showZWS = useSelector(selectShowZWS);
    const selectedStationId = useSelector(selectSelectedZomatoStationId);
    const cityStations = useSelector(selectVisibleCityStations);

    // Memoized function to calculate visible markers based on map bounds and zoom
    const calculateVisibleMarkers = useCallback((stations, mapInstance) => {
        if (!mapInstance || !showZWS || stations.length === 0) return [];

        const bounds = mapInstance.getBounds();
        const zoom = mapInstance.getZoom();

        // Performance optimization: show subset of markers at low zoom levels
        let step = 1;
        if (zoom < 8) step = 5;
        else if (zoom < 10) step = 3;
        else if (zoom < 12) step = 2;

        const visible = stations.filter((station, index) => {
            return index % step === 0 && bounds.contains([station.lat, station.lng]);
        });

        return visible;
    }, [showZWS]);

    // Handles both map changes and city/visibility changes
    useEffect(() => {
        console.log('ZWSOverlay useEffect triggered:', {
            hasMap: !!map,
            showZWS,
            selectedCities,
            hiddenCities,
            stationsCount: cityStations.length
        });

        if (!map || !showZWS) {
            setVisibleMarkers([]);
            return;
        }

        // Function to update visible markers
        const updateVisibleMarkers = () => {
            const newVisibleMarkers = calculateVisibleMarkers(cityStations, map);
            setVisibleMarkers(newVisibleMarkers);
        };

        // Immediate update
        updateVisibleMarkers();

        // Set up map event listeners for dynamic updates
        const handleMapChange = () => {
            // Small delay to ensure map bounds are updated
            setTimeout(updateVisibleMarkers, 50);
        };

        map.on('moveend', handleMapChange);
        map.on('zoomend', handleMapChange);

        // Cleanup
        return () => {
            map.off('moveend', handleMapChange);
            map.off('zoomend', handleMapChange);
        };
    }, [map, cityStations, showZWS, selectedCities, hiddenCities, calculateVisibleMarkers]);

    // FORCE UPDATE when visibility specifically changes
    useEffect(() => {
        if (map && showZWS) {
            const newVisibleMarkers = calculateVisibleMarkers(cityStations, map);
            setVisibleMarkers(newVisibleMarkers);
        }
    }, [selectedCities, hiddenCities, calculateVisibleMarkers, map, showZWS, cityStations]);

    // Get color based on temperature
    const getTemperatureColor = (temp) => {
        if (temp === null || temp === undefined) return '#94a3b8'; // gray for no data
        if (temp < 10) return '#3b82f6'; // blue
        if (temp < 20) return '#06b6d4'; // cyan
        if (temp < 30) return '#10b981'; // green
        if (temp < 35) return '#f59e0b'; // amber
        if (temp < 40) return '#f97316'; // orange
        return '#ef4444'; // red
    };

    // Handle station click
    const handleStationClick = useCallback((station) => {
        const newSelectedId = selectedStationId === station.id ? null : station.id;
        dispatch(setSelectedZomatoStationId(newSelectedId));
    }, [selectedStationId, dispatch]);

    // Render data row component
    const DataRow = ({ icon: Icon, label, value, unit, color = "text-gray-700" }) => {
        if (value === null || value === undefined) {
            return (
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 text-gray-400`} />
                    <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="font-semibold text-sm text-gray-400">N/A</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={`font-semibold text-sm ${color}`}>
                        {typeof value === 'number' ? value.toFixed(1) : value}{unit}
                    </p>
                </div>
            </div>
        );
    };

    if (!showZWS) return null; // Early return if stations shouldn't be shown

    return (
        <>
            {visibleMarkers.map(station => {
                const isSelected = selectedStationId === station.id;
                const weather = station.weather;
                const cityVisible = !hiddenCities.includes(station.city);

                // IMPROVED KEY: Include city visibility and selection state for better reconciliation
                const markerKey = station.id;

                return (
                    <CircleMarker
                        key={markerKey} // Enhanced key ensures proper re-rendering
                        center={[station.lat, station.lng]}
                        radius={isSelected ? 12 : 8}
                        pathOptions={{
                            fillColor: getTemperatureColor(weather?.temp),
                            color: isSelected ? '#000' : '#fff',
                            weight: isSelected ? 3 : 2,
                            opacity: cityVisible ? 1 : 0.3, // Visual feedback for hidden cities
                            fillOpacity: cityVisible ? 0.8 : 0.3
                        }}
                        eventHandlers={{
                            click: (e) => {
                                handleStationClick(station);
                                if (selectedStationId === station.id) {
                                    e.target.closePopup();
                                }
                            }
                        }}>
                        <Popup autoPan={false}>
                            <div className="p-2 w-72">
                                {/* Station Header */}
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="bg-orange-500 p-1.5 rounded-full">
                                        <MapPin className="w-3 h-3 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-xs">{station.name}</h4>
                                        <p className="text-xs text-gray-500">{station.city} • ID: {station.id}</p>
                                    </div>
                                </div>

                                {/* Weather Data */}
                                <div className="bg-gray-50 rounded-lg p-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <h5 className="font-semibold text-xs text-gray-700">Live Data</h5>
                                        {weather && weather.timestamp && (
                                            <span className="text-xs text-gray-500">
                                                {new Date(weather.timestamp).toLocaleTimeString()}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <DataRow
                                            icon={Thermometer}
                                            label="Temp"
                                            value={weather?.temp}
                                            unit="°C"
                                            color="text-red-500" />

                                        <DataRow
                                            icon={Droplets}
                                            label="Humidity"
                                            value={weather?.humidity}
                                            unit="%"
                                            color="text-blue-500" />

                                        <DataRow
                                            icon={Wind}
                                            label="Wind"
                                            value={weather?.windSpeed}
                                            unit="km/h"
                                            color="text-green-500" />

                                        <DataRow
                                            icon={CloudRain}
                                            label="Rain"
                                            value={weather?.rainIntensity}
                                            unit="mm/h"
                                            color="text-cyan-500" />

                                        <DataRow
                                            icon={Droplets}
                                            label="Total"
                                            value={weather?.rainfall}
                                            unit="mm"
                                            color="text-indigo-500" />

                                        <DataRow
                                            icon={WindIcon}
                                            label="Dir"
                                            value={weather?.windDirection}
                                            unit="°"
                                            color="text-purple-500" />
                                    </div>

                                    {/* Air Quality Data */}
                                    {(weather?.aqiPM10 !== null || weather?.aqiPM25 !== null) && (
                                        <div className="mt-2 pt-1 border-t border-gray-200">
                                            <h6 className="font-semibold text-xs text-gray-700 mb-1">Air Quality</h6>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <DataRow
                                                    icon={Gauge}
                                                    label="PM 10"
                                                    value={weather?.aqiPM10}
                                                    unit="μg/m³"
                                                    color="text-yellow-600" />

                                                <DataRow
                                                    icon={Gauge}
                                                    label="PM 2.5"
                                                    value={weather?.aqiPM25}
                                                    unit="μg/m³"
                                                    color="text-red-600" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Station Status */}
                                    <div className="mt-2 pt-1 border-t border-gray-200">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">
                                                {station.lat.toFixed(2)}, {station.lng.toFixed(2)}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {weather && Object.values(weather).some(v => v !== null) ? (
                                                    <>
                                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                        <span className="text-green-600">Live</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                                        <span className="text-gray-500">No Data</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </>
    );
};

export default ZWSOverlay;