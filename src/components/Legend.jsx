import React from 'react'
import { useSelector } from 'react-redux';
import { VariableIcon } from 'lucide-react'
import { colorScale } from '../hooks/helper';

import { selectSelectedVariable, selectWeatherVariables, selectCurrentStats } from '../redux/slices/weatherSlice';
import { selectOpenMeteoData, selectOpenMeteoCurrentTimeIndex } from '../redux/slices/openMeteoSlice';
import { selectShowStations, selectSelectedStationId, selectMapZoom, selectSelectedDataSource } from '../redux/slices/uiSlice';

const Legend = () => { // Remove selectedDataSource prop - get from Redux
    // Weather state from Redux
    const selectedVariable = useSelector(selectSelectedVariable);
    const weatherVariables = useSelector(selectWeatherVariables);
    const currentStats = useSelector(selectCurrentStats);

    // OpenMeteo state from Redux
    const openMeteoData = useSelector(selectOpenMeteoData);
    const openMeteoCurrentTimeIndex = useSelector(selectOpenMeteoCurrentTimeIndex);

    // UI state from Redux
    const selectedStationId = useSelector(selectSelectedStationId);
    const showStations = useSelector(selectShowStations);
    const mapZoom = useSelector(selectMapZoom);
    const selectedDataSource = useSelector(selectSelectedDataSource); // Get from Redux

    // Get OpenMeteo current hour stats - SIMPLIFIED to match PolygonOverlay exactly
    const getOpenMeteoCurrentStats = () => {
        if (!openMeteoData?.hourly?.temperature_2m || 
            openMeteoCurrentTimeIndex >= openMeteoData.hourly.temperature_2m.length) {
            return null;
        }
        
        const currentValue = openMeteoData.hourly.temperature_2m[openMeteoCurrentTimeIndex];
        if (currentValue === undefined || currentValue === null) {
            return null;
        }
        
        // Use EXACTLY the same SIMPLIFIED calculation as PolygonOverlay
        const baseTemp = currentValue;
        const temperatures = [];
        
        // Sample temperature variations using the exact same simple formula
        for (let i = 0; i < 50; i++) {
            const sampleLat = i * 0.01; // Sample points
            const sampleLng = i * 0.01;
            
            // EXACT same simple formula as PolygonOverlay
            const variation1 = Math.sin((sampleLat * 100) + (openMeteoCurrentTimeIndex * 0.5)) * 2;
            const variation2 = Math.cos((sampleLng * 80) + (openMeteoCurrentTimeIndex * 0.7)) * 1.5;
            const variation3 = Math.sin((sampleLat + sampleLng) * 60 + (openMeteoCurrentTimeIndex * 0.3)) * 1;
            
            const finalTemp = baseTemp + variation1 + variation2 + variation3;
            temperatures.push(finalTemp);
        }
        
        // Simple min/max like PolygonOverlay
        const minTemp = temperatures.length > 0 ? Math.min(...temperatures) : baseTemp;
        const maxTemp = temperatures.length > 0 ? Math.max(...temperatures) : baseTemp;
        
        return {
            min: minTemp.toFixed(1),
            max: maxTemp.toFixed(1)
        };
    };

    const openMeteoStats = getOpenMeteoCurrentStats();

    return (
        <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 z-30">
            <div className="flex items-center gap-2 mb-2">
                <VariableIcon className="w-4 h-4 text-gray-600" />
                <h4 className="text-sm font-medium text-gray-700">
                    {weatherVariables[selectedVariable]?.name || 'Temperature'}
                </h4>
            </div>

            <div className="flex items-center gap-1 mb-2">
                <span className="text-xs text-gray-500">Low</span>
                <div
                    className="w-20 h-4 rounded"
                    style={{
                        background: `linear-gradient(to right, ${(colorScale[selectedVariable] || colorScale.T2).map(color =>
                            `rgb(${color[0]}, ${color[1]}, ${color[2]})`
                        ).join(', ')})`
                    }} />
                <span className="text-xs text-gray-500">High</span>
            </div>

            {/* Current stats display for WRF */}
            {currentStats && selectedDataSource === 'wrf' && (
                <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                        <span>Min:</span>
                        <span>{currentStats.min}{weatherVariables[selectedVariable]?.unit}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Max:</span>
                        <span>{currentStats.max}{weatherVariables[selectedVariable]?.unit}</span>
                    </div>
                </div>
            )}

            {/* OpenMeteo stats display - should update with each timestamp */}
            {selectedDataSource === 'openmeteo' && openMeteoStats && (
                <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                        <span>Min:</span>
                        <span>{openMeteoStats.min}°C</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Max:</span>
                        <span>{openMeteoStats.max}°C</span>
                    </div>
                </div>
            )}

            {/* Zoom level indicator  */}
            {mapZoom !== null && (
                <div className="mt-2 pt-2 border-t border-gray-500 mb-1">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>Zoom:</span>
                        <span>{mapZoom}</span>
                    </div>
                </div>
            )}

            {/* Station info */}
            {showStations && (
                <div>
                    {selectedStationId && (
                        <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>Selected Station:</span>
                            <span>{selectedStationId}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default Legend;