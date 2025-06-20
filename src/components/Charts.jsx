import React, { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, BarChart, Bar, ScatterChart, Scatter, ComposedChart
} from 'recharts';
import {
    BarChart3, TrendingUp, Activity, Eye, EyeOff, X, Plus,
    Download, Settings, Maximize2, Minimize2, Filter
} from 'lucide-react';
import stationsData from '../data/aws_ghmc.json';
import { getGridValueAt } from '../hooks/helper';

// Redux selectors
import {
    selectWeatherData, selectSelectedVariable, selectCurrentTime,
    selectWeatherVariables, selectTimeSteps, setSelectedVariable
} from '../redux/slices/weatherSlice';
import {
    selectselectedPointsForComparison, selectCanAddMoreStations,
    addPointForComparison, removePointForComparison, clearPointsForComparison
} from '../redux/slices/dataTableSlice';

// Variable colors for consistency
const variableColors = {
    T2: '#ef4444', RH: '#3b82f6', TOTAL_RAIN: '#06b6d4',
    PBLH: '#8b5cf6', SST: '#f59e0b', TSK: '#dc2626',
    ALBEDO: '#64748b', EMISS: '#84cc16', VEGFRA: '#22c55e'
};

const Charts = () => {
    const dispatch = useDispatch();

    // Weather state
    const weatherData = useSelector(selectWeatherData);
    const selectedVariable = useSelector(selectSelectedVariable);
    const currentTime = useSelector(selectCurrentTime);
    const weatherVariables = useSelector(selectWeatherVariables);
    const timeSteps = useSelector(selectTimeSteps);

    // Station comparison state
    const selectedPointsForComparison = useSelector(selectselectedPointsForComparison);
    const canAddMoreStations = useSelector(selectCanAddMoreStations);

    // Local state for chart controls
    const [chartType, setChartType] = useState('line');
    const [showAverage, setShowAverage] = useState(true);
    const [showStationComparison, setShowStationComparison] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedTimeRange, setSelectedTimeRange] = useState('all');

    // Process time series data for the selected variable
    const timeSeriesData = useMemo(() => {
        if (!weatherData?.time_series) return [];

        const scale = weatherData.metadata?.variable_scales?.[selectedVariable] || 1;

        return weatherData.time_series.map(timePoint => {
            const values = timePoint.variables[selectedVariable];
            if (!values || !Array.isArray(values)) return { time: timePoint.time, value: null };

            const scaledValues = values.map(v => v / scale);
            const avgValue = scaledValues.reduce((sum, val) => sum + val, 0) / scaledValues.length;

            return {
                time: timePoint.time,
                value: parseFloat(avgValue.toFixed(4)),
                min: Math.min(...scaledValues),
                max: Math.max(...scaledValues),
                count: scaledValues.length
            };
        }).filter(item => item.value !== null);
    }, [weatherData, selectedVariable]);

    const mergedPointData = useMemo(() => {
        if (selectedPointsForComparison.length === 0 || !weatherData?.time_series) return [];

        const scale = weatherData.metadata?.variable_scales?.[selectedVariable] || 1;
        const gridInfo = weatherData.grid_info;

        return weatherData.time_series.map(timePoint => {
            const dataPoint = { time: timePoint.time };
            const values = timePoint.variables[selectedVariable];

            if (values && Array.isArray(values) && gridInfo) {
                selectedPointsForComparison.forEach(itemId => {
                    // Check if it's a grid point (assuming grid points are numeric IDs)
                    if (typeof itemId === 'number' || !isNaN(itemId)) {
                        // Handle grid point - direct array access
                        const gridIndex = parseInt(itemId);
                        if (gridIndex >= 0 && gridIndex < values.length) {
                            dataPoint[itemId] = parseFloat((values[gridIndex] / scale).toFixed(4));
                        } else {
                            dataPoint[itemId] = null;
                        }
                    } else {
                        // Handle AWS station - existing logic
                        const station = stationsData.find(s => s.id === itemId);
                        if (station) {
                            const stationValue = getGridValueAt(
                                station.lat, station.lon, values,
                                gridInfo, scale
                            );
                            dataPoint[itemId] = stationValue !== null ? parseFloat(stationValue.toFixed(4)) : null;
                        } else {
                            dataPoint[itemId] = null;
                        }
                    }
                });
            } else {
                selectedPointsForComparison.forEach(itemId => {
                    dataPoint[itemId] = null;
                });
            }

            return dataPoint;
        });
    }, [weatherData, selectedPointsForComparison, selectedVariable]);

    // Get station/point names
    const pointNames = useMemo(() => {
        return stationsData.reduce((acc, station) => {
            acc[station.id] = station.location || station.id;
            return acc;
        }, {});
    }, []);

    // Filter data based on selected time range
    const filteredTimeSeriesData = useMemo(() => {
        if (selectedTimeRange === 'all') return timeSeriesData;

        const ranges = { '24h': 24, '7d': 168, '30d': 720 };

        const limit = ranges[selectedTimeRange];
        return limit ? timeSeriesData.slice(-limit) : timeSeriesData;
    }, [timeSeriesData, selectedTimeRange]);

    // Filter merged station data based on selected time range
    const filteredStationData = useMemo(() => {
        if (selectedTimeRange === 'all') return mergedPointData;

        const ranges = { '24h': 24, '7d': 168, '30d': 720 };

        const limit = ranges[selectedTimeRange];
        return limit ? mergedPointData.slice(-limit) : mergedPointData;
    }, [mergedPointData, selectedTimeRange]);

    // Custom tooltip formatter
    const formatTooltip = useCallback((value, name) => {
        const unit = weatherVariables[selectedVariable]?.unit || '';
        if (typeof value === 'number') return [`${value.toFixed(4)} ${unit}`, name];
        return [value || 'No data', name];
    }, [selectedVariable, weatherVariables]);

    // Render chart based on type
    const renderChart = () => {
        const commonProps = {
            data: filteredTimeSeriesData,
            margin: { top: 5, right: 30, left: 20, bottom: 5 }
        };

        const xAxisProps = {
            dataKey: "time",
            tick: { fontSize: 12 },
            angle: -45,
            textAnchor: 'end'
        };

        const yAxisProps = {
            tick: { fontSize: 12 },
            label: {
                value: `${weatherVariables[selectedVariable]?.name} (${weatherVariables[selectedVariable]?.unit})`,
                angle: -90,
                position: 'insideLeft'
            }
        };

        switch (chartType) {
            case 'area':
                return (
                    <AreaChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis {...xAxisProps} />
                        <YAxis {...yAxisProps} />
                        <Tooltip formatter={formatTooltip} labelFormatter={(time) => `Time: ${time}`} />
                        <Legend />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={variableColors[selectedVariable]}
                            fill={variableColors[selectedVariable]}
                            fillOpacity={0.3}
                            strokeWidth={2}
                            name={`Average ${weatherVariables[selectedVariable]?.name}`} />
                    </AreaChart>
                );

            case 'bar':
                return (
                    <BarChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis {...xAxisProps} />
                        <YAxis {...yAxisProps} />
                        <Tooltip formatter={formatTooltip} labelFormatter={(time) => `Time: ${time}`} />
                        <Legend />
                        <Bar
                            dataKey="value"
                            fill={variableColors[selectedVariable]}
                            name={`Average ${weatherVariables[selectedVariable]?.name}`} />
                    </BarChart>
                );

            case 'composed':
                return (
                    <ComposedChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis {...xAxisProps} />
                        <YAxis {...yAxisProps} />
                        <Tooltip formatter={formatTooltip} labelFormatter={(time) => `Time: ${time}`} />
                        <Legend />
                        <Area
                            type="monotone"
                            dataKey="max"
                            stackId="1"
                            stroke="none"
                            fill={variableColors[selectedVariable]}
                            fillOpacity={0.1}
                            name="Max Range" />
                        <Area
                            type="monotone"
                            dataKey="min"
                            stackId="1"
                            stroke="none"
                            fill="#ffffff"
                            name="Min Range" />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={variableColors[selectedVariable]}
                            strokeWidth={3}
                            dot={false}
                            name={`Average ${weatherVariables[selectedVariable]?.name}`} />
                    </ComposedChart>
                );

            default:
                return (
                    <LineChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis {...xAxisProps} />
                        <YAxis {...yAxisProps} />
                        <Tooltip formatter={formatTooltip} labelFormatter={(time) => `Time: ${time}`} />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={variableColors[selectedVariable]}
                            strokeWidth={2}
                            dot={false}
                            name={`Average ${weatherVariables[selectedVariable]?.name}`} />
                    </LineChart>
                );
        }
    };

    const renderPointComparison = () => {
        if (!showStationComparison || selectedPointsForComparison.length === 0) return null;

        return (
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-medium">Compare Values Over Time</h4>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            <Plus className="w-4 h-4" />Selected ({selectedPointsForComparison.length}/5):
                        </span>
                        <div className="flex gap-1 flex-wrap">
                            {selectedPointsForComparison.map((stationId) => (
                                <span
                                    key={stationId}
                                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded flex items-center gap-1">
                                    {pointNames[stationId] || stationId}
                                    <button
                                        onClick={() => dispatch(removePointForComparison(stationId))}
                                        className="text-blue-600 hover:text-blue-800 transition-colors">
                                        <X className="w-3 h-3 cursor-pointer" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <ResponsiveContainer width="100%" height={isExpanded ? 500 : 400}>
                    <LineChart data={filteredStationData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                            dataKey="time"
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                        />
                        <YAxis
                            tick={{ fontSize: 12 }}
                            label={{
                                value: `${weatherVariables[selectedVariable]?.name} (${weatherVariables[selectedVariable]?.unit})`,
                                angle: -90,
                                position: 'insideLeft'
                            }} />
                        <Tooltip
                            formatter={formatTooltip}
                            labelFormatter={(time) => `Time: ${time}`} />
                        <Legend />
                        {selectedPointsForComparison.map((stationId, index) => (
                            <Line
                                key={stationId}
                                type="monotone"
                                dataKey={stationId}
                                stroke={`hsl(${(index * 360) / selectedPointsForComparison.length}, 70%, 50%)`}
                                strokeWidth={2}
                                name={pointNames[stationId] || stationId}
                                connectNulls={false}
                                dot={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    };

    if (!weatherData || timeSeriesData.length === 0) {
        console.log(weatherData);
        return (
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="text-center text-gray-500">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No chart data available</p>
                    <p className="text-sm">Load weather data to view time series charts</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-white transition-all duration-300 pt-6 ${isExpanded ? 'fixed inset-4 z-50' : 'p-0'}`}>
            {isExpanded && (
                <div className="absolute inset-0 bg-white rounded-lg shadow-2xl p-6 overflow-auto">
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10">
                        <Minimize2 className="w-5 h-5" />
                    </button>
                </div>
            )}

            <div className={isExpanded ? 'pr-16' : ''}>
                <div className="flex flex-col sm:flex-row items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Chart Analysis - {weatherVariables[selectedVariable]?.name}
                    </h3>

                    <div className="flex items-center gap-2 pt-6 sm:pt-0">
                        <div className="flex items-center gap-2 mr-4">
                            {/* Chart Type Selector */}
                            <select
                                value={chartType}
                                onChange={(e) => setChartType(e.target.value)}
                                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="line">Line Chart</option>
                                <option value="area">Area Chart</option>
                                <option value="bar">Bar Chart</option>
                                <option value="composed">Composed Chart</option>
                            </select>
                        </div>

                        {!isExpanded && (
                            <button
                                onClick={() => setIsExpanded(true)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Expand chart">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Station Comparison Chart */}
                {renderPointComparison()}

                {/* Average Time Series Chart */}
                <div className="mb-6">
                    <h4 className="text-md font-medium mb-4">Average Values Over Time</h4>
                    <ResponsiveContainer width="100%" height={isExpanded ? 500 : 300}>
                        {renderChart()}
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Charts;