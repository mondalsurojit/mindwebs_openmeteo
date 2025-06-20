import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useMap } from 'react-leaflet';
import { CircleMarker, Popup } from 'react-leaflet';
import { MapPin, Radio } from 'lucide-react';
import stationsData from '../../data/aws_ghmc.json';
import { interpolateColor, getGridValueAt } from '../../hooks/helper';

import {
    selectWeatherData, selectSelectedVariable, selectCurrentTime, selectWeatherVariables, selectCurrentStats
} from '../../redux/slices/weatherSlice';

import { selectSelectedStationId, selectShowStations, setSelectedStationId } from '../../redux/slices/uiSlice'

const StationsOverlay = () => {
    const map = useMap();
    const dispatch = useDispatch();

    const [visibleMarkers, setVisibleMarkers] = useState([]);

    const weatherData = useSelector(selectWeatherData);
    const selectedVariable = useSelector(selectSelectedVariable);
    const currentTime = useSelector(selectCurrentTime);
    const weatherVariables = useSelector(selectWeatherVariables);
    const currentStats = useSelector(selectCurrentStats);

    const selectedStationId = useSelector(selectSelectedStationId);
    const showStations = useSelector(selectShowStations);

    // Process station data with weather values
    const processedStations = useMemo(() => {
        if (!weatherData || !stationsData || !weatherData.grid_info) return [];

        return stationsData.map(station => {
            let weatherValue = null;

            if (weatherData.time_series && weatherData.time_series.length > 0) {
                const timeData = weatherData.time_series.find(t => t.time === currentTime);
                if (timeData && timeData.variables && timeData.variables[selectedVariable]) {

                    // Convert station coordinates to grid indices
                    const scale = weatherData.metadata?.variable_scales?.[selectedVariable] || 1;
                    weatherValue = getGridValueAt(
                        station.lat, station.lon,
                        timeData.variables[selectedVariable],
                        weatherData.grid_info, scale);
                }
            }

            return { ...station, weatherValue };
        });
    }, [weatherData, selectedVariable, currentTime]);

    // Virtualized markers based on zoom and bounds
    useEffect(() => {
        if (!map || !showStations) {
            setVisibleMarkers([]);
            return;
        }

        const updateVisibleMarkers = () => {
            const bounds = map.getBounds();
            const zoom = map.getZoom();

            // Only show subset of markers at low zoom levels for performance
            let step = 1;
            if (zoom < 8) step = 10;
            else if (zoom < 10) step = 5;
            else if (zoom < 12) step = 2;

            const visible = processedStations.filter((station, index) => {
                return index % step === 0 && bounds.contains([station.lat, station.lon]);
            });

            setVisibleMarkers(visible);
        };

        updateVisibleMarkers();
        map.on('moveend', updateVisibleMarkers);
        map.on('zoomend', updateVisibleMarkers);

        return () => {
            map.off('moveend', updateVisibleMarkers);
            map.off('zoomend', updateVisibleMarkers);
        };
    }, [map, processedStations, showStations]);


    if (!showStations) return null;

    return visibleMarkers.map(station => {
        const isSelected = selectedStationId === station.id;
        return (
            <CircleMarker
                key={station.id}
                center={[station.lat, station.lon]}
                radius={isSelected ? 12 : 8}
                pathOptions={{
                    fillColor: interpolateColor(station.weatherValue, currentStats.min, currentStats.max, selectedVariable),
                    color: isSelected ? '#000' : '#fff',
                    weight: isSelected ? 3 : 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }}
                eventHandlers={{
                    click: (e) => {
                        // Toggle selection: if already selected, deselect it
                        const newSelectedId = selectedStationId === station.id ? null : station.id;
                        dispatch(setSelectedStationId(newSelectedId));
                        if (newSelectedId === null) e.target.closePopup();
                    }
                }}>
                <Popup>
                    <div className="p-1 w-60">
                        <div className="flex items-center gap-2">
                            <Radio className="w-6 h-6 text-blue-600 min-w-8" />
                            <h4 className="font-semibold text-xs border-l-2 border-gray-200 pl-2 h-8 flex items-center">{station.location}</h4>
                        </div>
                        <div className="text-xs text-gray-600">
                            <p><span className="font-semibold">Station ID:</span> {station.id}</p>
                            <p><span className="font-semibold">Mandal:</span> {station.mandal}</p>
                            <p><span className="font-semibold">Coordinates:</span> {station.lat.toFixed(4)}, {station.lon.toFixed(4)}</p>
                            {station.weatherValue !== null && (
                                <p className="text-sm font-medium text-blue-600 pt-1">
                                    <span className="font-semibold">{selectedVariable}:</span> {station.weatherValue} {weatherVariables[selectedVariable].unit}
                                </p>
                            )}
                        </div>
                    </div>
                </Popup>
            </CircleMarker>
        );
    });
};

export default StationsOverlay;