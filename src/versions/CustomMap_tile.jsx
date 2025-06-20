import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Layers, Settings, Info, Palette, Eye, EyeOff, RotateCcw } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.vectorgrid/dist/Leaflet.VectorGrid.bundled.js';

// Custom hook for vector tiles with proper geometry handling
const useVectorTiles = (map, timestep, visible, colorScheme) => {
  const vectorLayerRef = useRef(null);

  useEffect(() => {
    if (!map || typeof L === 'undefined' || !L.vectorGrid) {
      console.error('Leaflet or VectorGrid not available');
      return;
    }

    // Remove existing vector layer
    if (vectorLayerRef.current) {
      map.removeLayer(vectorLayerRef.current);
    }

    if (!visible) return;

    // Define color schemes for different variables based on your backend metadata
    const colorSchemes = {
      temperature: {
        property: 'temperature_2m',
        colors: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
        range: [20, 45] // Celsius range based on your sample data
      },
      precipitation: {
        property: 'total_precipitation',
        colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
        range: [0, 50]
      },
      windSpeed: {
        property: 'wind_speed',
        colors: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'],
        range: [0, 30]
      },
      humidity: {
        property: 'relative_humidity',
        colors: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
        range: [0, 100]
      },
      skinTemperature: {
        property: 'skin_temperature',
        colors: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
        range: [25, 50]
      },
      albedo: {
        property: 'albedo',
        colors: ['#000000', '#252525', '#525252', '#737373', '#969696', '#bdbdbd', '#d9d9d9', '#f0f0f0', '#ffffff'],
        range: [0, 1]
      }
    };

    const scheme = colorSchemes[colorScheme] || colorSchemes.temperature;

    // Function to get color based on value
    const getColor = (value, min, max, colors) => {
      if (value === undefined || value === null || isNaN(value)) return '#888888';
      const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const index = Math.floor(normalized * (colors.length - 1));
      return colors[index] || colors[0];
    };

    // Create vector tile layer with proper styling
    const vectorLayer = L.vectorGrid.protobuf(`http://localhost:8000/tiles/${timestep}/{z}/{x}/{y}.mvt`, {
      rendererFactory: L.canvas.tile,
      attribution: 'Custom Weather Data',
      interactive: true,
      maxZoom: 14,
      vectorTileLayerStyles: {
        'weather_data': {
          fill: true,
          fillColor: (properties, zoom) => {
            const value = parseFloat(properties[scheme.property]);
            const isValid = !isNaN(value) && value !== null && value !== undefined;
            return isValid
              ? getColor(value, scheme.range[0], scheme.range[1], scheme.colors)
              : '#cccccc'; // fallback color
          },
          fillOpacity: 0.8,
          stroke: true,
          color: '#333333', // Border color for each grid
          weight: 0.5,       // Thin border
          opacity: 1
        }
      },
      getFeatureId: (f) => f.properties.mvt_id || f.properties.id || Math.random()
    });

    // Add comprehensive debugging events
    vectorLayer.on('loading', () => {
      console.log('Vector tiles loading for timestep:', timestep);
    });

    vectorLayer.on('load', () => {
      console.log('Vector tiles loaded successfully');
    });

    vectorLayer.on('tileload', (e) => {
      console.log('Tile loaded at coords:', e.coords);
      console.log('Tile object:', e.tile);
      console.log('Tile _layers:', e.tile._layers);
      console.log('Available layers in tile:', Object.keys(e.tile._layers || {}));

      // NEW: Check if tile has any data at all
      if (e.tile._vectorTileLayerNames) {
        console.log('Vector tile layer names:', e.tile._vectorTileLayerNames);
      }

      // NEW: Check raw tile data
      if (e.tile._rawData) {
        console.log('Raw tile data size:', e.tile._rawData.length);
      }

      // Check if our layer exists
      if (e.tile._layers && e.tile._layers['weather_data']) {
        console.log('✅ weather_data layer found in tile');
        console.log('Features in weather_data:', Object.keys(e.tile._layers['weather_data']));
      } else {
        console.log('❌ weather_data layer NOT found in tile');
        console.log('Available layers:', Object.keys(e.tile._layers || {}));
      }
    });

    vectorLayer.on('tileerror', (e) => {
      console.error('Tile error:', e);
      console.error('Tile URL:', e.tile.src);
    });

    vectorLayer.on('add', () => {
      console.log('Vector layer added to map');
    });

    vectorLayer.on('tileerror', (e) => {
      console.error('Tile error:', e);
      console.error('Error details:', e.error);
      console.error('Tile URL that failed:', e.target._url);
      // NEW: Check if it's a 404 or empty response
      if (e.error && e.error.status) {
        console.error('HTTP Status:', e.error.status);
      }
    });

    // Enhanced click events for feature info
    vectorLayer.on('click', (e) => {
      console.log('Vector layer clicked:', e);

      if (e.layer && e.layer.properties) {
        const props = e.layer.properties;
        console.log('Feature properties:', props);

        let popup = '<div class="p-3 max-w-sm"><h3 class="font-bold mb-2 text-sm">Weather Data Point</h3>';

        // Show key weather parameters
        if (props.lat && props.lon) {
          popup += `<div class="mb-1"><strong>Location:</strong> ${parseFloat(props.lat).toFixed(4)}, ${parseFloat(props.lon).toFixed(4)}</div>`;
        }
        if (props.temperature_2m !== undefined) {
          popup += `<div class="mb-1"><strong>Temperature:</strong> ${props.temperature_2m}°C</div>`;
        }
        if (props.skin_temperature !== undefined) {
          popup += `<div class="mb-1"><strong>Skin Temp:</strong> ${props.skin_temperature}°C</div>`;
        }
        if (props.relative_humidity !== undefined) {
          popup += `<div class="mb-1"><strong>Humidity:</strong> ${props.relative_humidity}%</div>`;
        }
        if (props.wind_speed !== undefined) {
          popup += `<div class="mb-1"><strong>Wind Speed:</strong> ${props.wind_speed} m/s</div>`;
        }
        if (props.wind_direction !== undefined) {
          popup += `<div class="mb-1"><strong>Wind Dir:</strong> ${props.wind_direction}°</div>`;
        }
        if (props.total_precipitation !== undefined) {
          popup += `<div class="mb-1"><strong>Precipitation:</strong> ${props.total_precipitation}mm</div>`;
        }
        if (props.albedo !== undefined) {
          popup += `<div class="mb-1"><strong>Albedo:</strong> ${props.albedo}</div>`;
        }
        if (props.time) {
          popup += `<div class="mb-1"><strong>Time:</strong> ${props.time}</div>`;
        }

        popup += '</div>';

        L.popup()
          .setLatLng(e.latlng)
          .setContent(popup)
          .openOn(map);
      } else {
        console.log('No feature properties found in click event');
      }
    });

    // Add to map
    console.log('Adding vector layer to map...');
    vectorLayer.addTo(map);
    vectorLayerRef.current = vectorLayer;

    return () => {
      if (vectorLayerRef.current) {
        map.removeLayer(vectorLayerRef.current);
      }
    };
  }, [map, timestep, visible, colorScheme]);

  return vectorLayerRef.current;
};

// Component to handle vector tiles
const VectorTileLayer = ({ timestep, visible, colorScheme }) => {
  const map = useMap();
  useVectorTiles(map, timestep, visible, colorScheme);
  return null;
};

// Legend component
const Legend = ({ colorScheme }) => {
  const colorSchemes = {
    temperature: { name: 'Temperature (°C)', colors: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'], range: [20, 45] },
    precipitation: { name: 'Total Precipitation (mm)', colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'], range: [0, 50] },
    windSpeed: { name: 'Wind Speed (m/s)', colors: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'], range: [0, 30] },
    humidity: { name: 'Relative Humidity (%)', colors: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'], range: [0, 100] },
    skinTemperature: { name: 'Skin Temperature (°C)', colors: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'], range: [25, 50] },
    albedo: { name: 'Albedo', colors: ['#000000', '#252525', '#525252', '#737373', '#969696', '#bdbdbd', '#d9d9d9', '#f0f0f0', '#ffffff'], range: [0, 1] }
  };

  const scheme = colorSchemes[colorScheme];

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-[1000] max-w-xs">
      <h4 className="font-semibold mb-2 text-sm">{scheme.name}</h4>
      <div className="flex items-center space-x-1">
        <span className="text-xs">{scheme.range[0]}</span>
        <div className="flex-1 h-4 flex rounded">
          {scheme.colors.map((color, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <span className="text-xs">{scheme.range[1]}</span>
      </div>
    </div>
  );
};

const CustomMap = () => {
  const [timestep, setTimestep] = useState('001');
  const [vectorVisible, setVectorVisible] = useState(true);
  const [colorScheme, setColorScheme] = useState('temperature');
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Hyderabad coordinates
  const hyderabadCenter = [17.3850, 78.4867];

  const handleTimestepChange = (newTimestep) => {
    setIsLoading(true);
    setTimestep(newTimestep);
    setTimeout(() => setIsLoading(false), 500);
  };

  const availableTimesteps = ['001', '002', '003', '004', '005'];

  return (
    <div className="relative w-full h-screen bg-gray-100">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-white shadow-md z-[1000] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="text-blue-600" size={24} />
            <h1 className="text-xl font-bold text-gray-800">Weather Data Viewer - Hyderabad</h1>
          </div>
          <button
            onClick={() => setShowControls(!showControls)}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Controls Panel */}
      {showControls && (
        <div className="absolute top-20 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000] w-80">
          <h3 className="font-semibold mb-4 flex items-center">
            <Settings size={16} className="mr-2" />
            Map Controls
          </h3>

          {/* Timestep Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Timestep</label>
            <div className="grid grid-cols-5 gap-1">
              {availableTimesteps.map((ts) => (
                <button
                  key={ts}
                  onClick={() => handleTimestepChange(ts)}
                  className={`px-3 py-2 text-xs rounded ${timestep === ts
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                    } transition-colors`}
                >
                  {ts}
                </button>
              ))}
            </div>
          </div>

          {/* Color Scheme Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 flex items-center">
              <Palette size={14} className="mr-1" />
              Variable
            </label>
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="temperature">Air Temperature</option>
              <option value="skinTemperature">Skin Temperature</option>
              <option value="precipitation">Total Precipitation</option>
              <option value="windSpeed">Wind Speed</option>
              <option value="humidity">Relative Humidity</option>
              <option value="albedo">Surface Albedo</option>
            </select>
          </div>

          {/* Layer Visibility */}
          <div className="mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vectorVisible}
                onChange={(e) => setVectorVisible(e.target.checked)}
                className="rounded"
              />
              {vectorVisible ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="text-sm">Weather Data Points</span>
            </label>
          </div>

          {/* Debug Info */}
          <div className="mb-4 p-2 bg-gray-50 rounded text-xs">
            <div><strong>Current Timestep:</strong> {timestep}</div>
            <div><strong>Tile URL:</strong> /tiles/{timestep}/&#123;z&#125;/&#123;x&#125;/&#123;y&#125;.mvt</div>
            <div><strong>Layer Name:</strong> weather_data</div>
            <div><strong>Property:</strong> {colorScheme === 'temperature' ? 'temperature_2m' :
              colorScheme === 'skinTemperature' ? 'skin_temperature' :
                colorScheme === 'precipitation' ? 'total_precipitation' :
                  colorScheme === 'windSpeed' ? 'wind_speed' :
                    colorScheme === 'humidity' ? 'relative_humidity' : 'albedo'}</div>
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <RotateCcw className="animate-spin mr-2" size={16} />
              <span className="text-sm">Loading tiles...</span>
            </div>
          )}
        </div>
      )}

      {/* Map Container */}
      <div className="absolute top-20 left-0 right-0 bottom-0">
        <MapContainer
          center={hyderabadCenter}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          {/* Base Layer - OpenStreetMap */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* Vector Tiles Layer */}
          <VectorTileLayer
            timestep={timestep}
            visible={vectorVisible}
            colorScheme={colorScheme}
          />
        </MapContainer>
      </div>

      {/* Legend */}
      {vectorVisible && <Legend colorScheme={colorScheme} />}

      {/* Info Panel */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Info size={14} />
          <span>Click on data points for details</span>
        </div>
      </div>
    </div>
  );
};

export default CustomMap;