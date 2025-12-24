import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';
import { camera, currentSprites, scene } from '../globals.js';

export function exportToSVG() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, 'svg');
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    const style = document.createElementNS(svgNS, 'style');
    style.textContent = `
        svg {
            background-color: ${scene.background.getStyle()};
        }
        text {
            font-family: monospace;
            text-anchor: middle;
            dominant-baseline: middle;
        }
    `;
    svg.appendChild(style);

    const spritesToExport = [...currentSprites];

    const cameraWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPosition);
    
    spritesToExport.sort((a, b) => {
        const aPos = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
        const bPos = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
        return aPos.distanceTo(cameraWorldPosition) - bPos.distanceTo(cameraWorldPosition);
    }).reverse();

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    spritesToExport.forEach(sprite => {
        const pos = new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld);
        
        if (!frustum.containsPoint(pos)) {
            return;
        }

        const projectedPos = pos.clone().project(camera);
        const x = (projectedPos.x * 0.5 + 0.5) * width;
        const y = (-projectedPos.y * 0.5 + 0.5) * height;

        const svgExportBaseSize = sprite.userData.baseSize * 2.5;

        let currentSpriteSize;
        if (sprite.userData.type === 'label') {
            if (sprite.userData.enableSize) {
                const baseScreenSize = svgExportBaseSize * 0.5;
                const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                currentSpriteSize = Math.max(baseScreenSize, scaledSize);
            } else {
                currentSpriteSize = svgExportBaseSize * 0.5;
            }

            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            
            const fontSize = currentSpriteSize * 30; // Heuristic value
            text.setAttribute('font-size', `${fontSize}px`);

            const color = sprite.userData.textColor;
            if (color) {
                text.setAttribute('fill', `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`);
            } else {
                text.setAttribute('fill', 'white');
            }
            
            text.textContent = sprite.userData.ratio;
            svg.appendChild(text);

        } else if (sprite.userData.type === 'point') {
            if (sprite.userData.enableSize) {
                const baseScreenSize = svgExportBaseSize * 0.01;
                const scaledSize = baseScreenSize + (sprite.userData.normalizedComplexity * baseScreenSize * (sprite.userData.scalingFactor - 1));
                currentSpriteSize = Math.max(baseScreenSize, scaledSize);
            } else {
                currentSpriteSize = svgExportBaseSize * 0.01;
            }

            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            
            const radius = currentSpriteSize * 100; // Heuristic value
            circle.setAttribute('r', radius);
            
            const color = sprite.material.color;
            circle.setAttribute('fill', color.getStyle());
            circle.setAttribute('fill-opacity', sprite.material.opacity);
            svg.appendChild(circle);
        }
    });

    return new XMLSerializer().serializeToString(svg);
}

export function downloadSVG(svgString, filename) {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadCSV(csvString, filename) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

export function simplifyFraction(n, d) {
    const commonDivisor = gcd(n, d);
    return `${n / commonDivisor}/${d / commonDivisor}`;
}

export function exportToCSV() {
    if (currentSprites.length === 0) {
        console.warn("No data to export.");
        return;
    }

    const complexityMethodSelect = document.getElementById('complexityMethod');
    const complexityMethod = complexityMethodSelect.options[complexityMethodSelect.selectedIndex].text;

    let data = [];
    const processedRatios = new Set();

    currentSprites.forEach(sprite => {
        if (sprite.userData.ratio && sprite.userData.complexity !== undefined && !processedRatios.has(sprite.userData.ratio)) {
            const chordRatio = sprite.userData.ratio;
            const parts = chordRatio.split(':').map(Number);
            const fundamental = parts[0];

            const notes = parts.map(p => simplifyFraction(p, fundamental)).join(' ');
            const cents = parts.map(p => Math.round(1200 * Math.log2(p / fundamental))).join(' ');

            data.push({
                chord: chordRatio,
                notes: notes,
                cents: cents,
                complexity: sprite.userData.complexity
            });
            processedRatios.add(chordRatio);
        }
    });

    // Sort by complexity, lowest first
    data.sort((a, b) => a.complexity - b.complexity);

    // Generate CSV content
    const header = `Chord,Notes,Cents,${complexityMethod}`;
    const rows = data.map(d => `${d.chord},"${d.notes}","${d.cents}",${d.complexity}`);
    const csvContent = [header, ...rows].join('\n');

    downloadCSV(csvContent, 'tetrads-export.csv');
}
