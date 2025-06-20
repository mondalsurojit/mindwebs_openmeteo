export const colorScale = {
    T2: [ // Temperature (°C): blue to red
        [0, 0, 255], [0, 128, 255], [0, 255, 255], [128, 255, 0],
        [255, 255, 0], [255, 128, 0], [255, 0, 0]
    ],
    RH: [ // Humidity (%): white to blue
        [255, 255, 255], [200, 220, 255], [150, 180, 255],
        [100, 140, 255], [50, 100, 255], [0, 60, 255]
    ],
    TOTAL_RAIN: [ // Precipitation (mm): white to dark blue
        [255, 255, 255], [200, 220, 255], [150, 180, 255],
        [100, 140, 255], [50, 100, 255], [0, 60, 200], [0, 0, 150]
    ],
    SST: [ // Sea Surface Temp (°C): cyan to orange
        [0, 255, 255], [0, 200, 255], [100, 150, 255],
        [200, 100, 200], [255, 150, 100], [255, 200, 0]
    ],
    TSK: [ // Surface Temperature (°C): similar to T2
        [0, 0, 255], [0, 128, 255], [0, 255, 255], [128, 255, 0],
        [255, 255, 0], [255, 128, 0], [255, 0, 0]
    ],
    // PBLH: [ // Boundary Layer Height (m): yellow to purple
    //     [255, 255, 0], [255, 200, 0], [255, 150, 0],
    //     [255, 100, 100], [200, 50, 150], [150, 0, 200]
    // ],
    // ALBEDO: [ // Albedo (0–1): black to white
    //     [0, 0, 0], [64, 64, 64], [128, 128, 128],
    //     [192, 192, 192], [255, 255, 255]
    // ],
    // EMISS: [ // Emissivity: grayscale to red
    //     [240, 240, 240], [200, 160, 160], [160, 100, 100],
    //     [120, 60, 60], [100, 30, 30], [80, 0, 0]
    // ],
    // VEGFRA: [ // Vegetation Fraction (%): brown to green
    //     [165, 42, 42], [180, 100, 60], [120, 150, 80],
    //     [60, 180, 80], [0, 200, 0], [0, 255, 0]
    // ]
};

const variableRanges = {
    'T2': { min: 0, max: 50 },
    'TSK': { min: 0, max: 50 },
    'RH': { min: 0, max: 100 },
    'TOTAL_RAIN': { min: 0, max: 50 },
    'SST': { min: 0, max: 35 },
    // 'PBLH': { min: 0, max: 3000 },
    // 'ALBEDO': { min: 0, max: 1 },
    // 'EMISS': { min: 0.8, max: 1.0 },
    // 'VEGFRA': { min: 0, max: 1 }
};

export const interpolateColor = (value, min, max, variableType) => {

    if (variableType === undefined || variableType === null || value === undefined || value === null) {
        return "rgb(128, 128, 128)"; // Neutral gray
    }
    const colorArray = colorScale[variableType];
    const minVal = (min !== undefined && min !== null) ? min : variableRanges[variableType].min;
    const maxVal = (max !== undefined && max !== null) ? max : variableRanges[variableType].max;

    // Handle case where minVal === maxVal
    if (minVal === maxVal) {
        const [r, g, b] = colorArray[0];
        return `rgb(${r}, ${g}, ${b})`;
    }

    const normalized = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)));
    const index = Math.floor(normalized * (colorArray.length - 1));
    const nextIndex = Math.min(index + 1, colorArray.length - 1);
    const factor = (normalized * (colorArray.length - 1)) - index;
    const [color1, color2] = [colorArray[index], colorArray[nextIndex]];

    const r = Math.round(color1[0] + factor * (color2[0] - color1[0]));
    const g = Math.round(color1[1] + factor * (color2[1] - color1[1]));
    const b = Math.round(color1[2] + factor * (color2[2] - color1[2]));

    return `rgb(${r}, ${g}, ${b})`;
};



export const calculateGridCoordinates = (index, gridInfo) => {
    if (!gridInfo || !gridInfo.corner || !gridInfo.size || !gridInfo.steps) {
        return { lat: 0, lon: 0 };
    }

    const [cornerLat, cornerLon] = gridInfo.corner;
    const [rows, cols] = gridInfo.size;
    const [latStep, lonStep] = gridInfo.steps;

    // Calculate row and column from linear index
    const row = Math.floor(index / cols);
    const col = index % cols;

    // Calculate actual lat/lon
    const lat = cornerLat + (row * latStep);
    const lon = cornerLon + (col * lonStep);

    return { lat, lon };
};

export const getGridValueAt = (lat, lon, values, gridInfo, scale = 1) => {
    const { corner, size, steps } = gridInfo;
    const [cornerLat, cornerLon] = corner;
    const [rows, cols] = size;
    const [latStep, lonStep] = steps;

    // Calculate the row and column using floor (to find the containing cell)
    const row = Math.floor((lat - cornerLat) / latStep);
    const col = Math.floor((lon - cornerLon) / lonStep);

    // Return null if outside the grid
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;

    // Convert to linear index
    const index = row * cols + col;

    // Return scaled value, or null if index exceeds bounds (just in case)
    return index < values.length ? values[index] / scale : null;
};