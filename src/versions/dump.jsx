export const generateDemoData = () => {
    const gridSize = 30;
    const timeSteps = 24;
    const corner = [16.5, 77.5];
    const steps = [0.05, 0.05];

    const variables = ['T2', 'RH', 'WIND', 'TOTAL_RAIN', 'PBLH', 'SST'];
    const timeSeries = [];

    for (let t = 0; t < timeSteps; t++) {
        const timeData = {
            time: t,
            variables: {}
        };

        variables.forEach(variable => {
            timeData.variables[variable] = [];
            for (let i = 0; i < gridSize * gridSize; i++) {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                let value;

                switch (variable) {
                    case 'T2':
                        value = 25 + 10 * Math.sin((t + row + col) * 0.2) + Math.random() * 5;
                        break;
                    case 'RH':
                        value = 60 + 20 * Math.cos((t + row * 2) * 0.15) + Math.random() * 10;
                        break;
                    case 'WIND':
                        value = 5 + 3 * Math.sin((t + col) * 0.25) + Math.random() * 2;
                        break;
                    case 'TOTAL_RAIN':
                        value = Math.max(0, 2 * Math.sin((t + row) * 0.3) + Math.random() * 3);
                        break;
                    case 'PBLH':
                        value = 500 + 300 * Math.cos((t + row + col) * 0.1) + Math.random() * 100;
                        break;
                    case 'SST':
                        value = 28 + 3 * Math.sin((t) * 0.2) + Math.random() * 2;
                        break;
                    default:
                        value = Math.random() * 100;
                }
                timeData.variables[variable].push(value);
            }
        });

        timeSeries.push(timeData);
    }

    return {
        grid_info: {
            corner: corner,
            size: [gridSize, gridSize],
            steps: steps
        },
        time_series: timeSeries,
        metadata: {
            variable_scales: {
                T2: 1, RH: 1, WIND: 1, TOTAL_RAIN: 1, PBLH: 1, SST: 1
            }
        }
    };
};
