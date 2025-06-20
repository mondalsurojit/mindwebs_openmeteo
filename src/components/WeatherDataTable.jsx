import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Search, Plus, ChevronLeft, ChevronRight, BarChart3, Download, ToggleLeft, ToggleRight, X } from 'lucide-react';
import Charts from './Charts';

import stationsData from '../data/aws_ghmc.json';
import { interpolateColor, getGridValueAt, calculateGridCoordinates } from '../hooks/helper';

import {
    selectWeatherData, selectSelectedVariable, selectCurrentTime, selectWeatherVariables, selectCurrentTimeData, selectCurrentStats
} from '../redux/slices/weatherSlice';

import { selectSelectedStationId, setSelectedStationId } from '../redux/slices/uiSlice';

import {
    selectselectedPointsForComparison, addPointForComparison, removePointForComparison
} from '../redux/slices/dataTableSlice';


const ToggleCompareButton = ({ pointId, selectedPointsForComparison }) => {
    const dispatch = useDispatch();
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                if (selectedPointsForComparison.includes(pointId)) {
                    dispatch(removePointForComparison(pointId));
                } else dispatch(addPointForComparison(pointId));
            }}
            disabled={!selectedPointsForComparison.includes(pointId) && selectedPointsForComparison.length >= 5}
            className={`px-2 py-1 text-white text-xs rounded hover:opacity-80 disabled:bg-gray-300 cursor-pointer disabled:cursor-not-allowed mr-2 transition-all duration-200 ${selectedPointsForComparison.includes(pointId)
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-400 hover:bg-blue-500'
                }`}
            title={selectedPointsForComparison.includes(pointId) ? "Remove from comparison" : "Add to comparison"}>
            <Plus className={`w-3 h-3 transition-transform duration-200 ${selectedPointsForComparison.includes(pointId) ? 'rotate-45' : 'rotate-0'}`} />
        </button>
    )
}

const WeatherDataTable = ({ itemsPerPage = 5 }) => {
    const dispatch = useDispatch();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [showAWS, setShowAWS] = useState(true); // Toggle between Grid & AWS (default)

    // Redux selectors
    const weatherData = useSelector(selectWeatherData);
    const selectedVariable = useSelector(selectSelectedVariable);
    const currentTime = useSelector(selectCurrentTime);
    const weatherVariables = useSelector(selectWeatherVariables);
    const currentTimeData = useSelector(selectCurrentTimeData);
    const currentStats = useSelector(selectCurrentStats);

    const selectedStationId = useSelector(selectSelectedStationId);
    const selectedPointsForComparison = useSelector(selectselectedPointsForComparison);

    // Process grid data
    const gridData = useMemo(() => {
        if (!weatherData || !currentTimeData || !currentTimeData.variables || !currentTimeData.variables[selectedVariable]) { return []; }

        const values = currentTimeData.variables[selectedVariable];
        const scale = weatherData.metadata?.variable_scales?.[selectedVariable] || 1;
        const gridInfo = weatherData.grid_info;

        if (!values || !Array.isArray(values) || !gridInfo) return [];

        return values.map((value, index) => {
            const { lat, lon } = calculateGridCoordinates(index, gridInfo);
            return {
                id: index, type: 'grid', number: index + 1,
                lat: lat, lon: lon, value: value / scale, tag: null
            };
        });
    }, [weatherData, currentTimeData, selectedVariable]);

    // Process AWS data with actual weather data interpolation
    const awsData = useMemo(() => {
        if (!stationsData || !Array.isArray(stationsData) || !currentTimeData || !weatherData) return [];

        const values = currentTimeData.variables?.[selectedVariable];
        const scale = weatherData.metadata?.variable_scales?.[selectedVariable] || 1;
        const gridInfo = weatherData.grid_info;

        if (!values || !gridInfo) return [];

        return stationsData.map((station) => {
            const gridValueAt = getGridValueAt(station.lat, station.lon, values, gridInfo, scale);

            return {
                id: station.id,
                type: 'aws',
                station: station.id,
                lat: station.lat,
                lon: station.lon,
                location: station.location,
                mandal: station.mandal,
                value: gridValueAt !== null ? gridValueAt.toFixed(2) : null,
                tag: `AWS-${station.id}`
            };
        });
    }, [stationsData, currentTimeData, selectedVariable, weatherData]);

    const currentData = showAWS ? awsData : gridData; // based on toggle

    // Get filtered & paginated table data based on search term
    const getFilteredTableData = () => {
        const filteredData = currentData.filter(point => {
            const searchLower = searchTerm.toLowerCase();
            if (showAWS) {
                return point.location.toLowerCase().includes(searchLower) ||
                    point.station.toString().toLowerCase().includes(searchLower) ||
                    point.mandal.toLowerCase().includes(searchLower) ||
                    point.tag.toLowerCase().includes(searchLower);
            } else {
                return point.number.toString().includes(searchTerm) ||
                    point.lat.toString().includes(searchTerm) ||
                    point.lon.toString().includes(searchTerm);
            }
        });

        // Paginate
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        return {
            tableData: paginatedData,
            totalItems: filteredData.length,
            totalPages: Math.ceil(filteredData.length / itemsPerPage)
        };
    };

    const downloadAsExcel = () => {
        const variable = weatherVariables?.[selectedVariable] || { name: selectedVariable, unit: '' };

        // Prepare data for export
        const exportData = currentData.map(point => {
            if (showAWS) {
                return {
                    'Station': point.station,
                    'Lat': point.lat.toFixed(6),
                    'Long': point.lon.toFixed(6),
                    'Location': point.location,
                    'Mandal': point.mandal,
                    'Value': point.value != null ? `${point.value} ${variable.unit}` : 'N/A'

                };
            } else {
                return {
                    'Number': point.number,
                    'Lat': point.lat.toFixed(6),
                    'Long': point.lon.toFixed(6),
                    'Value': point.value != null ? `${point.value} ${variable.unit}` : 'N/A'

                };
            }
        });

        // Convert to CSV (simplified Excel export)
        const headers = Object.keys(exportData[0] || {});
        const csvContent = [
            headers.join(','),
            ...exportData.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${showAWS ? 'AWS' : 'Grid'}_${variable.name}_Data.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const variable = weatherVariables?.[selectedVariable] || { name: selectedVariable, unit: '' };
    const { tableData, totalItems, totalPages } = getFilteredTableData();

    const values = currentData.map(d => d.value);
    const [minValue, maxValue, avgValue] = currentStats
        ? [currentStats.min, currentStats.max, currentStats.avg] : [0, 0, 0];

    if (currentData.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />Data Table - {variable.name}
                </h3>
                <div className="text-center text-gray-500 py-8">
                    No data available for current selection
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            {/* Header - Mobile Responsive */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h3 className="text-lg font-semibold flex items-center justify-center sm:justify-start gap-2">
                    <BarChart3 className="w-5 h-5" />
                    <span className="truncate">Data Table - {variable.name}</span>
                </h3>

                <div className="flex flex-row items-center justify-center gap-3 xs:gap-4">
                    {/* Toggle between Grid and AWS */}
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                        <span className={`text-sm font-medium ${!showAWS ? 'text-blue-600' : 'text-gray-500'}`}>
                            Grid</span>
                        <button
                            onClick={() => {
                                setShowAWS(!showAWS);
                                setCurrentPage(1);
                                setSearchTerm('');
                            }}
                            className="text-gray-600 hover:text-blue-600 cursor-pointer">
                            {showAWS ? (
                                <ToggleRight className="w-6 h-6 text-blue-600" />
                            ) : (
                                <ToggleLeft className="w-6 h-6" />
                            )}
                        </button>
                        <span className={`text-sm font-medium ${showAWS ? 'text-blue-600' : 'text-gray-500'}`}>
                            AWS</span>
                    </div>

                    {/* Download Excel Button */}
                    <button onClick={downloadAsExcel}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 cursor-pointer min-w-fit">
                        <Download className="w-4 h-4" />
                        <span className="inline">Excel</span>
                    </button>
                </div>
            </div>

            {/* Search and Controls - Mobile Responsive */}
            <div className="flex flex-row gap-4 mb-4">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder={showAWS ? "Search station, location..." : "Search number, lat, lon..."}
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                </div>
                <div className="flex items-center justify-center sm:justify-end text-sm text-gray-600 bg-gray-50 px-0 sm:px-3 py-2 rounded-md">
                    <span className="hidden sm:inline">Showing&nbsp;</span>
                    {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalItems)}/{totalItems}
                </div>
            </div>

            {/* Single Row Summary - Mobile Responsive */}
            <section className="my-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Value Distribution Summary */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            <BarChart3 className="w-4 h-4" />Stats:</span>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-md border border-blue-200">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                                <span className="text-xs font-medium text-blue-700">Min:</span>
                                <span className="text-xs font-semibold text-blue-800">{minValue} {variable.unit}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-md border border-green-200">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                <span className="text-xs font-medium text-green-700">Avg:</span>
                                <span className="text-xs font-semibold text-green-800">{avgValue} {variable.unit}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-md border border-red-200">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                <span className="text-xs font-medium text-red-700">Max:</span>
                                <span className="text-xs font-semibold text-red-800">{maxValue} {variable.unit}</span>
                            </div>
                        </div>
                    </div>

                    {/* Selected Stations for Comparison */}
                    {selectedPointsForComparison.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Selected ({selectedPointsForComparison.length}/5):</span>
                                <span className="sm:hidden">Selected ({selectedPointsForComparison.length}/5):</span>
                            </span>
                            <div className="flex flex-wrap gap-1">
                                {selectedPointsForComparison.map(stationId => {
                                    const station = awsData.find(point => point.id === stationId);
                                    return (
                                        <span
                                            key={stationId}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded border border-blue-200">
                                            <span className="max-w-20 sm:max-w-none truncate">
                                                {station?.location || stationId}
                                            </span>
                                            <button
                                                onClick={() => dispatch(removePointForComparison(stationId))}
                                                className="ml-1 text-blue-600 hover:text-blue-800 text-xs"
                                                title="Remove from comparison">
                                                <X className="w-3 h-3 cursor-pointer" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Data Table - Mobile Responsive */}
            <div className="overflow-x-auto max-h-96 -mx-4 sm:mx-0">
                <div className="min-w-full px-4 sm:px-0">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {showAWS ? (
                                    // AWS Table Headers
                                    <>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Station</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Lat</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Long</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Location</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap hidden sm:table-cell">Mandal</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Value</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Actions</th>
                                    </>
                                ) : (
                                    // Grid Table Headers
                                    <>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Number</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Lat</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Long</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Value</th>
                                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Actions</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tableData.map((point, index) => (
                                <tr
                                    key={`${point.type}_${point.id}`}
                                    className={`hover:bg-gray-50 cursor-pointer transition-colors duration-150
                                        ${showAWS && selectedPointsForComparison.includes(point.id)
                                            ? 'bg-gradient-to-r from-blue-50 to-transparent border-l-2 border-blue-300'
                                            : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectedPointsForComparison.includes(point.id)) {
                                            dispatch(removePointForComparison(point.id));
                                        } else dispatch(addPointForComparison(point.id));
                                    }}>
                                    {showAWS ? (
                                        // AWS Table Rows
                                        <>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-900 font-medium">
                                                <span className="inline-block px-1 sm:px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                                    <span className="hidden sm:inline">{point.tag}</span>
                                                    <span className="sm:hidden">{point.station}</span>
                                                </span>
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{point.lat.toFixed(4)}</td>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{point.lon.toFixed(4)}</td>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-900">
                                                <span className="max-w-24 sm:max-w-none truncate block">{point.location}</span>
                                                <span className="text-xs text-gray-500 sm:hidden">{point.mandal}</span>
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-500 whitespace-nowrap hidden sm:table-cell">{point.mandal}</td>
                                            <td className="px-2 sm:px-4 py-2 text-sm">
                                                <span
                                                    className="inline-block px-1 sm:px-2 py-1 rounded text-white text-xs font-medium whitespace-nowrap"
                                                    style={{ backgroundColor: interpolateColor(point.value, minValue, maxValue, selectedVariable) }}>
                                                    {point.value != null ? `${point.value} ${variable.unit}` : 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 text-sm">
                                                <ToggleCompareButton pointId={point.id}
                                                    selectedPointsForComparison={selectedPointsForComparison} />
                                            </td>
                                        </>
                                    ) : (
                                        // Grid Table Rows
                                        <>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-900 font-medium whitespace-nowrap">{point.number}</td>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{point.lat.toFixed(4)}</td>
                                            <td className="px-2 sm:px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{point.lon.toFixed(4)}</td>
                                            <td className="px-2 sm:px-4 py-2 text-sm">
                                                <span
                                                    className="inline-block px-1 sm:px-2 py-1 rounded text-white text-xs font-medium whitespace-nowrap"
                                                    style={{ backgroundColor: interpolateColor(point.value, minValue, maxValue, selectedVariable) }}>
                                                    {point.value != null ? `${point.value} ${variable.unit}` : 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 text-sm">
                                                <ToggleCompareButton pointId={point.id}
                                                    selectedPointsForComparison={selectedPointsForComparison} />
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination - Mobile Responsive */}
            {totalPages > 1 && (
                <div className="flex flex-row items-center justify-between gap-4 mt-4">
                    <div className="text-sm text-gray-600">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-2 sm:px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed">
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        {/* Page numbers - Responsive */}
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(window.innerWidth < 640 ? 3 : 5, totalPages) }, (_, i) => {
                                const pageNum = Math.max(1, currentPage - Math.floor((window.innerWidth < 640 ? 3 : 5) / 2)) + i;
                                if (pageNum > totalPages) return null;
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`px-2 sm:px-3 py-1 rounded text-sm ${pageNum === currentPage
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                            }`}>{pageNum}</button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-2 sm:px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )
            }
            <Charts />
        </div >
    );
};

export default WeatherDataTable;