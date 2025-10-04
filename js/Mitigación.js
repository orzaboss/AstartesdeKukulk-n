// Dataset de asteroides
const asteroids = [
    {
        id: 1,
        name: "433 Eros",
        diameter: 16700,
        velocity: 24450,
        mass: 6.687e15,
        density: 2670
    },
    {
        id: 2,
        name: "99942 Apophis",
        diameter: 370,
        velocity: 30730,
        mass: 2.7e10,
        density: 3200
    },
    {
        id: 3,
        name: "101955 Bennu",
        diameter: 490,
        velocity: 28000,
        mass: 7.329e10,
        density: 1190
    }
];

let selectedAsteroid = null;

function init() {
    displayAsteroids();
}

function displayAsteroids() {
    const list = document.getElementById('asteroidList');
    list.innerHTML = '';
    
    asteroids.forEach(asteroid => {
        const card = document.createElement('div');
        card.className = 'asteroid-card';
        card.onclick = () => selectAsteroid(asteroid, card);
        card.innerHTML = `
            <div class="asteroid-name">${asteroid.name}</div>
            <div class="asteroid-info">
                Diámetro: ${asteroid.diameter.toLocaleString()} m<br>
                Velocidad: ${asteroid.velocity.toLocaleString()} m/s<br>
                Masa: ${asteroid.mass.toExponential(2)} kg
            </div>
        `;
        list.appendChild(card);
    });
}

function selectAsteroid(asteroid, cardElement) {
    selectedAsteroid = asteroid;
    
    document.querySelectorAll('.asteroid-card').forEach(card => {
        card.classList.remove('selected');
    });
    cardElement.classList.add('selected');
    
    const details = document.getElementById('asteroidDetails');
    details.className = 'asteroid-details active';
    details.innerHTML = `
        <h3>Información Detallada</h3>
        <div class="detail-grid">
            <div class="detail-item">
                <span class="detail-label">Nombre:</span>
                <span class="detail-value">${asteroid.name}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Diámetro:</span>
                <span class="detail-value">${asteroid.diameter.toLocaleString()} m</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Velocidad:</span>
                <span class="detail-value">${asteroid.velocity.toLocaleString()} m/s</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Masa:</span>
                <span class="detail-value">${asteroid.mass.toExponential(3)} kg</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Densidad:</span>
                <span class="detail-value">${asteroid.density.toLocaleString()} kg/m³</span>
            </div>
        </div>
    `;
}

// Estrategias de Mitigación
function calculateKineticImpact(asteroid, warningTime, distance) {
    const impactorMass = 500;
    const impactorVelocity = 10000;
    const beta = 1.9;
    
    const deltaV = (beta * impactorMass * impactorVelocity) / asteroid.mass;
    const timeSeconds = warningTime * 365.25 * 24 * 3600;
    const deviation = deltaV * timeSeconds;
    const earthRadii = deviation / 6371000;
    
    return {
        method: "Impacto Cinético",
        formula: "Δv = (β × m_impactor × v_impactor) / m_asteroid",
        parameters: {
            "Masa impactor": `${impactorMass} kg`,
            "Velocidad impactor": `${impactorVelocity.toLocaleString()} m/s`,
            "Factor β": beta,
            "Masa asteroide": `${asteroid.mass.toExponential(2)} kg`
        },
        deltaV: deltaV,
        deviation: deviation,
        earthRadii: earthRadii
    };
}

function calculateGravitationalTractor(asteroid, warningTime, distance) {
    const spacecraftMass = 20000;
    const operationDistance = 100;
    const G = 6.674e-11;
    
    const force = (G * spacecraftMass * asteroid.mass) / (operationDistance * operationDistance);
    const acceleration = force / asteroid.mass;
    const timeSeconds = warningTime * 365.25 * 24 * 3600;
    const deltaV = acceleration * timeSeconds;
    const deviation = deltaV * timeSeconds;
    const earthRadii = deviation / 6371000;
    
    return {
        method: "Tractor Gravitacional",
        formula: "F = G × m_nave × m_asteroid / r²; Δv = (F/m) × t",
        parameters: {
            "Masa nave": `${spacecraftMass.toLocaleString()} kg`,
            "Distancia operación": `${operationDistance} m`,
            "Constante G": `${G.toExponential(3)}`,
            "Tiempo": `${warningTime} años`
        },
        deltaV: deltaV,
        deviation: deviation,
        earthRadii: earthRadii
    };
}

function calculateLaserAblation(asteroid, warningTime, distance) {
    const laserPower = 1e6;
    const efficiency = 0.1;
    const ablationVelocity = 1000;
    
    const massFlowRate = (laserPower * efficiency) / (0.5 * ablationVelocity * ablationVelocity);
    const timeSeconds = warningTime * 365.25 * 24 * 3600;
    const deltaV = (massFlowRate * ablationVelocity * timeSeconds) / asteroid.mass;
    const deviation = deltaV * timeSeconds;
    const earthRadii = deviation / 6371000;
    
    return {
        method: "Ablación Láser",
        formula: "Δv = (ṁ × v_ablation × t) / m_asteroid",
        parameters: {
            "Potencia láser": `${(laserPower/1e6).toFixed(1)} MW`,
            "Eficiencia": `${(efficiency*100)}%`,
            "Velocidad ablación": `${ablationVelocity} m/s`,
            "Flujo de masa": `${massFlowRate.toExponential(2)} kg/s`
        },
        deltaV: deltaV,
        deviation: deviation,
        earthRadii: earthRadii
    };
}

function calculateNuclearExplosion(asteroid, warningTime, distance) {
    const yieldMegatons = 1;
    const yieldJoules = yieldMegatons * 4.184e15;
    const efficiency = 0.05;
    const standoffDistance = asteroid.diameter;
    
    const energyTransferred = yieldJoules * efficiency;
    const deltaV = Math.sqrt((2 * energyTransferred) / asteroid.mass);
    const timeSeconds = warningTime * 365.25 * 24 * 3600;
    const deviation = deltaV * timeSeconds;
    const earthRadii = deviation / 6371000;
    
    return {
        method: "Explosión Nuclear",
        formula: "Δv = √(2 × E_transferred / m_asteroid)",
        parameters: {
            "Rendimiento": `${yieldMegatons} Megaton`,
            "Energía total": `${yieldJoules.toExponential(2)} J`,
            "Eficiencia": `${(efficiency*100)}%`,
            "Distancia detonación": `${standoffDistance.toLocaleString()} m`
        },
        deltaV: deltaV,
        deviation: deviation,
        earthRadii: earthRadii
    };
}

function calculateAllStrategies() {
    if (!selectedAsteroid) {
        alert('Por favor selecciona un asteroide primero');
        return;
    }

    const warningTime = parseFloat(document.getElementById('warningTime').value);
    const distance = parseFloat(document.getElementById('distance').value);

    const results = [
        calculateKineticImpact(selectedAsteroid, warningTime, distance),
        calculateGravitationalTractor(selectedAsteroid, warningTime, distance),
        calculateLaserAblation(selectedAsteroid, warningTime, distance),
        calculateNuclearExplosion(selectedAsteroid, warningTime, distance)
    ];

    displayResults(results);
}

function displayResults(results) {
    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = '';

    results.forEach(result => {
        const card = document.createElement('div');
        card.className = 'strategy-card';
        
        let paramsHTML = '';
        for (const [key, value] of Object.entries(result.parameters)) {
            paramsHTML += `
                <div class="result-item">
                    <span class="result-label">${key}:</span>
                    <span class="result-value">${value}</span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="strategy-title">${result.method}</div>
            <div class="formula">${result.formula}</div>
            <h4>Parámetros:</h4>
            ${paramsHTML}
            <h4>Resultados:</h4>
            <div class="result-item">
                <span class="result-label">Δv:</span>
                <span class="result-value">${result.deltaV.toExponential(3)} m/s</span>
            </div>
            <div class="result-item">
                <span class="result-label">Desviación total:</span>
                <span class="result-value">${result.deviation.toExponential(3)} m</span>
            </div>
            <div class="result-item">
                <span class="result-label">Radios terrestres:</span>
                <span class="result-value">${result.earthRadii.toFixed(2)} R⊕</span>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

window.onload = init;

