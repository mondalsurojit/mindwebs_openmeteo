import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { interpolateColor } from '../../hooks/helper';
import 'leaflet/dist/leaflet.css';

import {
    selectWeatherData, selectSelectedVariable, selectCurrentTime, selectWeatherVariables
} from '../../redux/slices/weatherSlice';

import { selectOpacity } from '../../redux/slices/uiSlice';

const GridOverlay = ({ onHover }) => {
    const map = useMap();
    
    // Double buffering refs
    const currentOverlayRef = useRef(null);
    const nextOverlayRef = useRef(null);
    const currentCanvasRef = useRef(null);
    const nextCanvasRef = useRef(null);
    
    const gridDataRef = useRef(null);
    const animationRef = useRef(null);
    const isUpdatingRef = useRef(false);
    const isTransitioningRef = useRef(false);
    
    // Pre-rendering refs
    const preRenderTimeoutRef = useRef(null);
    const nextFrameDataRef = useRef(null);

    const weatherData = useSelector(selectWeatherData);
    const selectedVariable = useSelector(selectSelectedVariable);
    const currentTime = useSelector(selectCurrentTime);
    const opacity = useSelector(selectOpacity);

    // Helper function to process grid data
    const processGridData = useCallback((weatherData, timeData, variable) => {
        const { corner, size, steps } = weatherData.grid_info;
        const values = timeData.variables[variable];
        const scale = weatherData.metadata?.variable_scales?.[variable] || 1;

        if (!values || !Array.isArray(values) || values.length === 0) {
            return null;
        }

        const scaledValues = values.map(v => (v || 0) / scale);
        const minValue = Math.min(...scaledValues);
        const maxValue = Math.max(...scaledValues);

        const gridCells = [];
        let valueIndex = 0;

        for (let row = 0; row < size[0]; row++) {
            for (let col = 0; col < size[1]; col++) {
                if (valueIndex >= values.length) break;

                const lat1 = corner[0] + row * steps[0];
                const lat2 = corner[0] + (row + 1) * steps[0];
                const lng1 = corner[1] + col * steps[1];
                const lng2 = corner[1] + (col + 1) * steps[1];

                const centerLat = (lat1 + lat2) / 2;
                const centerLng = (lng1 + lng2) / 2;

                const cellData = {};
                Object.keys(timeData.variables).forEach(variable => {
                    const varScale = weatherData.metadata?.variable_scales?.[variable] || 1;
                    const varValue = timeData.variables[variable]?.[valueIndex];
                    if (varValue !== undefined) {
                        cellData[variable] = varValue / varScale;
                    }
                });

                gridCells.push({
                    bounds: [[lat1, lng1], [lat2, lng2]],
                    center: [centerLat, centerLng],
                    value: scaledValues[valueIndex],
                    allData: cellData,
                    row, col
                });

                valueIndex++;
            }
        }

        return { cells: gridCells, minValue, maxValue, timeData };
    }, []);

    // Process grid data with memoization for current frame
    const processedGridData = useMemo(() => {
        if (!weatherData?.time_series?.length || !weatherData?.grid_info) {
            return null;
        }

        const timeData = weatherData.time_series.find(t => t.time === currentTime);
        if (!timeData?.variables?.[selectedVariable]) {
            return null;
        }

        return processGridData(weatherData, timeData, selectedVariable);
    }, [weatherData, selectedVariable, currentTime, processGridData]);

    // Create canvas with grid data
    const createCanvas = useCallback((gridData, targetCanvas = null) => {
        if (!gridData || !map) return null;

        const mapBounds = map.getBounds();
        const size = map.getSize();

        // Use existing canvas or create new one
        const canvas = targetCanvas || document.createElement('canvas');
        canvas.width = size.x;
        canvas.height = size.y;
        const ctx = canvas.getContext('2d');

        // Clear canvas
        ctx.clearRect(0, 0, size.x, size.y);

        const { minValue, maxValue, cells } = gridData;
        let renderedCells = 0;

        // Calculate data bounds
        let dataBounds = {
            north: -90, south: 90, east: -180, west: 180
        };

        cells.forEach(cell => {
            const [[lat1, lng1], [lat2, lng2]] = cell.bounds;
            dataBounds.north = Math.max(dataBounds.north, Math.max(lat1, lat2));
            dataBounds.south = Math.min(dataBounds.south, Math.min(lat1, lat2));
            dataBounds.east = Math.max(dataBounds.east, Math.max(lng1, lng2));
            dataBounds.west = Math.min(dataBounds.west, Math.min(lng1, lng2));
        });

        // Check bounds intersection
        const boundsIntersect = !(
            dataBounds.north < mapBounds.getSouth() ||
            dataBounds.south > mapBounds.getNorth() ||
            dataBounds.east < mapBounds.getWest() ||
            dataBounds.west > mapBounds.getEast()
        );

        if (boundsIntersect) {
            // Render grid cells
            cells.forEach(cell => {
                const [[lat1, lng1], [lat2, lng2]] = cell.bounds;

                const cellInBounds = !(
                    Math.max(lat1, lat2) < mapBounds.getSouth() ||
                    Math.min(lat1, lat2) > mapBounds.getNorth() ||
                    Math.max(lng1, lng2) < mapBounds.getWest() ||
                    Math.min(lng1, lng2) > mapBounds.getEast()
                );

                if (cellInBounds) {
                    const topLeft = map.latLngToContainerPoint([lat1, lng1]);
                    const bottomRight = map.latLngToContainerPoint([lat2, lng2]);

                    const width = Math.abs(bottomRight.x - topLeft.x);
                    const height = Math.abs(bottomRight.y - topLeft.y);

                    if (width > 0.1 && height > 0.1) {
                        ctx.fillStyle = interpolateColor(cell.value, minValue, maxValue, selectedVariable);
                        ctx.globalAlpha = opacity;
                        ctx.fillRect(
                            Math.min(topLeft.x, bottomRight.x),
                            Math.min(topLeft.y, bottomRight.y),
                            width, height
                        );
                        renderedCells++;
                    }
                }
            });
        }

        return { canvas, imageUrl: canvas.toDataURL(), renderedCells, dataBounds };
    }, [map, selectedVariable, opacity]);

    // Smooth transition between overlays
    const transitionToNewOverlay = useCallback((newImageUrl, mapBounds) => {
        if (isTransitioningRef.current || !map) return;
        
        isTransitioningRef.current = true;

        // Create new overlay
        const newOverlay = L.imageOverlay(newImageUrl, mapBounds, {
            opacity: 0, // Start invisible
            interactive: false,
            pane: 'overlayPane'
        });

        newOverlay.addTo(map);

        // Smooth fade transition
        let startTime = null;
        const duration = 150; // 150ms transition

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Fade in new overlay
            newOverlay.setOpacity(progress);
            
            // Fade out old overlay
            if (currentOverlayRef.current) {
                currentOverlayRef.current.setOpacity(1 - progress);
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Remove old overlay
                if (currentOverlayRef.current) {
                    map.removeLayer(currentOverlayRef.current);
                }
                
                // Switch references
                currentOverlayRef.current = newOverlay;
                isTransitioningRef.current = false;
            }
        };

        requestAnimationFrame(animate);
    }, [map]);

    // Pre-render next frame
    const preRenderNextFrame = useCallback(() => {
        if (!weatherData?.time_series?.length || isUpdatingRef.current) return;

        // Find next time step
        const currentIndex = weatherData.time_series.findIndex(t => t.time === currentTime);
        const nextIndex = (currentIndex + 1) % weatherData.time_series.length;
        const nextTimeData = weatherData.time_series[nextIndex];

        if (nextTimeData && nextTimeData.variables?.[selectedVariable]) {
            const nextGridData = processGridData(weatherData, nextTimeData, selectedVariable);
            if (nextGridData) {
                nextFrameDataRef.current = nextGridData;
                
                // Pre-render canvas
                const result = createCanvas(nextGridData, nextCanvasRef.current);
                if (result) {
                    // Store for smooth transition
                    nextFrameDataRef.current.preRendered = result;
                }
            }
        }
    }, [weatherData, currentTime, selectedVariable, processGridData, createCanvas]);

    // Update current frame
    const updateCurrentFrame = useCallback(() => {
        if (isUpdatingRef.current || !processedGridData || !map) return;
        
        isUpdatingRef.current = true;

        try {
            const result = createCanvas(processedGridData, currentCanvasRef.current);
            
            if (result) {
                const mapBounds = map.getBounds();
                
                if (!currentOverlayRef.current) {
                    // First render - no transition needed
                    const overlay = L.imageOverlay(result.imageUrl, mapBounds, {
                        opacity: 1,
                        interactive: false,
                        pane: 'overlayPane'
                    });
                    overlay.addTo(map);
                    currentOverlayRef.current = overlay;
                } else {
                    // Smooth transition
                    transitionToNewOverlay(result.imageUrl, mapBounds);
                }
                
                gridDataRef.current = processedGridData;
                currentCanvasRef.current = result.canvas;
            }

            // Pre-render next frame after a short delay
            if (preRenderTimeoutRef.current) {
                clearTimeout(preRenderTimeoutRef.current);
            }
            preRenderTimeoutRef.current = setTimeout(preRenderNextFrame, 100);

        } catch (error) {
            console.error('Error updating canvas:', error);
        } finally {
            isUpdatingRef.current = false;
        }
    }, [processedGridData, map, createCanvas, transitionToNewOverlay, preRenderNextFrame]);

    // Handle data changes with requestAnimationFrame
    useEffect(() => {
        if (processedGridData && map) {
            // Use requestAnimationFrame for smooth updates
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            
            animationRef.current = requestAnimationFrame(() => {
                updateCurrentFrame();
            });
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [processedGridData, updateCurrentFrame, map]);

    // Handle map events
    useEffect(() => {
        if (!map) return;

        const handleMapChange = () => {
            if (processedGridData && !isUpdatingRef.current && !isTransitioningRef.current) {
                // Debounce map changes
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
                
                animationRef.current = requestAnimationFrame(() => {
                    setTimeout(updateCurrentFrame, 16); // ~60fps
                });
            }
        };

        // Mouse move handler for hover
        const handleMouseMove = (e) => {
            if (!gridDataRef.current || !map || map.getZoom() < 10) return;

            const latlng = e.latlng;
            const { cells } = gridDataRef.current;

            const hoveredCell = cells.find(cell => {
                const [[lat1, lng1], [lat2, lng2]] = cell.bounds;
                return latlng.lat >= Math.min(lat1, lat2) &&
                    latlng.lat <= Math.max(lat1, lat2) &&
                    latlng.lng >= Math.min(lng1, lng2) &&
                    latlng.lng <= Math.max(lng1, lng2);
            });

            if (hoveredCell && onHover) {
                onHover({
                    position: e.containerPoint,
                    data: hoveredCell.allData,
                    center: hoveredCell.center,
                    variable: selectedVariable
                });
            }
        };

        const handleMouseOut = () => {
            if (onHover) onHover(null);
        };

        map.on('moveend', handleMapChange);
        map.on('zoomend', handleMapChange);
        map.on('mousemove', handleMouseMove);
        map.on('mouseout', handleMouseOut);

        return () => {
            map.off('moveend', handleMapChange);
            map.off('zoomend', handleMapChange);
            map.off('mousemove', handleMouseMove);
            map.off('mouseout', handleMouseOut);
        };
    }, [map, updateCurrentFrame, processedGridData, selectedVariable, onHover]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (preRenderTimeoutRef.current) {
                clearTimeout(preRenderTimeoutRef.current);
            }
            if (currentOverlayRef.current && map) {
                map.removeLayer(currentOverlayRef.current);
            }
            if (nextOverlayRef.current && map) {
                map.removeLayer(nextOverlayRef.current);
            }
        };
    }, [map]);

    return null;
};

export default GridOverlay;