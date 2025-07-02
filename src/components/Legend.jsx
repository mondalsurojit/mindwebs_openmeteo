import React from 'react'
import { useSelector } from 'react-redux';
import { VariableIcon } from 'lucide-react'
import { colorScale } from '../hooks/helper';

import { selectSelectedVariable, selectWeatherVariables, selectCurrentStats } from '../redux/slices/weatherSlice';

import { selectShowStations, selectSelectedStationId, selectMapZoom } from '../redux/slices/uiSlice';

const Legend = () => {
    // Weather state from Redux
    const selectedVariable = useSelector(selectSelectedVariable);
    const weatherVariables = useSelector(selectWeatherVariables);
    const currentStats = useSelector(selectCurrentStats);

    // UI state from Redux
    const selectedStationId = useSelector(selectSelectedStationId);
    const showStations = useSelector(selectShowStations);
    const mapZoom = useSelector(selectMapZoom);

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

            {/* Current stats display */}
            {currentStats && (
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