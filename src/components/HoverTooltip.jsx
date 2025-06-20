import React from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { selectWeatherVariables } from '../redux/slices/weatherSlice';
import { selectHoverData } from '../redux/slices/uiSlice';

const HoverTooltip = () => {
    const weatherVariables = useSelector(selectWeatherVariables);
    const hoverData = useSelector(selectHoverData);

    if (!hoverData) return null;
    const { position, data, center, variable } = hoverData;

    return (
        <div
            className="absolute bg-white border border-gray-300 rounded-lg shadow-lg p-3 pointer-events-none z-40 w-64"
            style={{
                left: position.x + 10, top: position.y - 10,
                transform: position.y < 100 ? 'translateY(0)' : 'translateY(-100%)'
            }}>
            <div className="text-sm font-semibold mb-2">Weather Data</div>
            <div className="text-xs text-gray-600 mb-2">
                Lat: {center[0].toFixed(4)}, Lng: {center[1].toFixed(4)}
            </div>
            <div className="space-y-1">
                {Object.entries(data).map(([key, value]) => {
                    const varInfo = weatherVariables[key];
                    if (!varInfo) return null;

                    return (
                        <div key={key} className={`flex justify-between text-xs ${key === variable ? 'font-semibold text-blue-600' : ''}`}>
                            <span>{varInfo.name}:</span>
                            <span>{value.toFixed(2)} {varInfo.unit}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default HoverTooltip;