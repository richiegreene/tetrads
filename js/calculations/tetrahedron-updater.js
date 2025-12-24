
import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';
import { 
    pyodide, python_ready, scene, currentLayoutMode,
    latestUpdateToken,
    setLatestUpdateToken, setCurrentSprites, setScene, setCurrentLayoutMode,
    camera
} from '../globals.js';
import { transformToRegularTetrahedron, makeTextSprite, makePointSprite } from '../components/three-visualizer.js';
import { plasmaColormap, viridisColormap, greyscaleColormap, greyscaleBlackColormap } from './color-mapping.js';

export async function cycleLayoutMode() {
    setCurrentLayoutMode((currentLayoutMode + 1) % 4);

    switch (currentLayoutMode) {
        case 0: // Plasma
        case 1: // Viridis
        case 2: // Greyscale Black
            scene.background = new THREE.Color(0x000000);
            break;
        case 3: // Greyscale White
            scene.background = new THREE.Color(0xffffff);
            break;
    }

    // We need to re-run updateTetrahedron to apply new colors
    const limitType = document.getElementById('limitType').value;
    const limitValueInput = document.getElementById('limitValue').value;
    let limitValue = limitValueInput;
    let virtualFundamentalFilter = null;

    if (limitValueInput.includes('/')) {
        const parts = limitValueInput.split('/');
        limitValue = parts[0].trim();
        const filterStr = parts[1].trim();
        
        virtualFundamentalFilter = [];
        if (filterStr.includes('...')) {
            const rangeParts = filterStr.split('...');
            const start = parseInt(rangeParts[0]);
            const end = parseInt(rangeParts[1]);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    virtualFundamentalFilter.push(i);
                }
            }
        } else {
            virtualFundamentalFilter = filterStr.split('.').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        }
    }
    
    const maxExponent = document.getElementById('maxExponent').value;
    const equaveRatio = parseFloat(document.getElementById('equaveRatio').value);
    const complexityMethod = document.getElementById('complexityMethod').value;
    const hideUnisonVoices = document.getElementById('hideUnisonVoices').checked;
    const omitOctaves = document.getElementById('omitOctaves').checked;
    const baseSize = parseFloat(document.getElementById('baseSize').value);
    const scalingFactor = parseFloat(document.getElementById('scalingFactor').value);
    const enableSize = document.getElementById('enableSize').checked;
    const enableColor = document.getElementById('enableColor').checked;
    const layoutDisplay = document.getElementById('layoutDisplay').value;
    
    await updateTetrahedron(
        limitType, limitValue, maxExponent, virtualFundamentalFilter, equaveRatio, complexityMethod, 
        hideUnisonVoices, omitOctaves, baseSize, scalingFactor, 
        enableSize, enableColor, layoutDisplay
    );
}

export async function updateTetrahedron(limit_type, limit_value, max_exponent, virtual_fundamental_filter, equave_ratio, complexity_method, hide_unison_voices, omit_octaves, base_size, scaling_factor, enable_size, enable_color, layout_display) {
    if (!python_ready) {
        console.warn("Python environment not ready yet. Please wait.");
        return;
    }
    
    // Cancellation token to prevent out-of-order updates from mutating the scene
    const updateToken = Symbol('update');
    setLatestUpdateToken(updateToken);

    // Keep a reference to existing scene children so the previous display remains
    const previousChildren = scene.children.slice();

    // Build new content in a temporary group; don't remove the old scene children until new content is ready
    const newGroup = new THREE.Group();
    const tempSprites = [];

    const max_cents_value = 1200 * Math.log2(equave_ratio);

    pyodide.globals.set("py_hide_unison_voices", hide_unison_voices);
    pyodide.globals.set("py_omit_octaves", omit_octaves);

    const py_limit_value = typeof limit_value === 'string' && limit_value.includes('.') ? `"${limit_value}"` : limit_value;
    const py_virtual_fundamental_filter = virtual_fundamental_filter ? JSON.stringify(virtual_fundamental_filter) : 'None';

    const points_py_code = `
        from tetrahedron_generator import generate_points
        generate_points(
            limit_value=${py_limit_value}, 
            equave_ratio=${equave_ratio}, 
            limit_mode="${limit_type.toLowerCase()}", 
            max_exponent=${max_exponent},
            complexity_measure="${complexity_method}", 
            hide_unison_voices=py_hide_unison_voices, 
            omit_octaves=py_omit_octaves,
            virtual_fundamental_filter=${py_virtual_fundamental_filter}
        )
    `;
    const labels_py_code = `
        from theory.calculations import generate_ji_tetra_labels
        generate_ji_tetra_labels(
            limit_value=${py_limit_value}, 
            equave_ratio=${equave_ratio}, 
            limit_mode="${limit_type.toLowerCase()}", 
            max_exponent=${max_exponent},
            complexity_measure="${complexity_method}", 
            hide_unison_voices=py_hide_unison_voices, 
            omit_octaves=py_omit_octaves,
            virtual_fundamental_filter=${py_virtual_fundamental_filter}
        )
    `;

    const raw_points_data = await pyodide.runPythonAsync(points_py_code);
    const raw_labels_data = await pyodide.runPythonAsync(labels_py_code);

    const positions = [];
    const colors = [];
    const color = new THREE.Color();

    let minComplexity = Infinity;
    let maxComplexity = -Infinity;
    if (raw_points_data.length > 0) {
        raw_points_data.forEach(p => {
            minComplexity = Math.min(minComplexity, p[3]);
            maxComplexity = Math.max(maxComplexity, p[3]);
        });
    }

    const labels_map = new Map();
    raw_labels_data.forEach(label_item => {
        const coords_key = `${label_item[0][0].toFixed(2)},${label_item[0][1].toFixed(2)},${label_item[0][2].toFixed(2)}`;
        labels_map.set(coords_key, {label: label_item[1], complexity: label_item[2]});
    });


    const label_conversion_factor = 0.066;
    const point_conversion_factor = 2.5;

    const internal_label_base_size = base_size * label_conversion_factor;
    const internal_point_base_size = base_size * point_conversion_factor;

    for (const p of raw_points_data) {
        // Abort if a newer update started
        if (latestUpdateToken !== updateToken) return;
        const c1 = p[0];
        const c2 = p[1];
        const c3 = p[2];
        
        const [transformed_x, transformed_y, transformed_z] = transformToRegularTetrahedron(c1, c2, c3, max_cents_value);

        positions.push(transformed_x, transformed_y, transformed_z);

        let normalizedComplexity = (p[3] - minComplexity) / (maxComplexity - minComplexity);
        
        let invertedComplexity = 1 - normalizedComplexity;

        let displayColor = new THREE.Color();
        let spriteTextColor = { r:255, g:255, b:255, a:1.0 };
        let spritePointColor = new THREE.Color(1, 1, 1);
        let spritePointOpacity = 0.7;
        if (currentLayoutMode === 3) { // Greyscale White
            spritePointOpacity = 0.9;
        }

        if (enable_color) {
            const colorScalingFactor = scaling_factor / 2;
            let scaledComplexity = invertedComplexity * colorScalingFactor;
            scaledComplexity = Math.min(1, Math.max(0, scaledComplexity));
            
            let mappedColor;
            switch (currentLayoutMode) {
                case 0: // Plasma
                    mappedColor = plasmaColormap(scaledComplexity);
                    break;
                case 1: // Viridis
                    mappedColor = viridisColormap(scaledComplexity);
                    break;
                case 2: // Greyscale Black
                    mappedColor = greyscaleBlackColormap(scaledComplexity);
                    break;
                case 3: // Greyscale White
                    mappedColor = greyscaleColormap(scaledComplexity);
                    break;
            }
            displayColor.setRGB(mappedColor.r, mappedColor.g, mappedColor.b);
            spriteTextColor = { r: mappedColor.r * 255, g: mappedColor.g * 255, b: mappedColor.b * 255, a:1.0 };
            spritePointColor.setRGB(mappedColor.r, mappedColor.g, mappedColor.b);
        } else {
            if (currentLayoutMode === 3) { // Greyscale White
                displayColor.setRGB(0, 0, 0);
                spriteTextColor = { r: 0, g: 0, b: 0, a: 1.0 };
                spritePointColor.setRGB(0, 0, 0);
            } else {
                displayColor.setRGB(1, 1, 1);
                spriteTextColor = { r: 255, g: 255, b: 255, a: 1.0 };
                spritePointColor.setRGB(1, 1, 1);
            }
        }
        colors.push(displayColor.r, displayColor.g, displayColor.b);

        const coords_key = `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`;
        const label_data = labels_map.get(coords_key);
        const label_text = label_data ? label_data.label : undefined;
        const complexity = label_data ? label_data.complexity : undefined;

        if (layout_display === 'labels') {
            if (label_text) {
                const sprite = makeTextSprite(label_text, { textColor: spriteTextColor });
                sprite.position.set(transformed_x + 0.05, transformed_y + 0.05, transformed_z);
                sprite.userData.normalizedComplexity = invertedComplexity;
                sprite.userData.baseSize = internal_label_base_size;
                sprite.userData.scalingFactor = scaling_factor;
                sprite.userData.enableSize = enable_size;
                sprite.userData.type = 'label';
                sprite.userData.ratio = label_text;
                sprite.userData.complexity = complexity;
                    newGroup.add(sprite);
                    tempSprites.push(sprite);
            }
        } else if (layout_display === 'points') {
            const sprite = makePointSprite(spritePointColor, spritePointOpacity);
            sprite.position.set(transformed_x, transformed_y, transformed_z);
            sprite.userData.normalizedComplexity = invertedComplexity;
            sprite.userData.baseSize = internal_point_base_size;
            sprite.userData.scalingFactor = scaling_factor;
            sprite.userData.enableSize = enable_size;
            sprite.userData.type = 'point';
            if (label_text) {
                sprite.userData.ratio = label_text;
                sprite.userData.complexity = complexity;
            }
                // Check again before adding in case update was cancelled mid-loop
                if (latestUpdateToken !== updateToken) return;
                newGroup.add(sprite);
                tempSprites.push(sprite);
        }
        }

        // If a newer update started while we were generating, abort without modifying scene
        if (latestUpdateToken !== updateToken) return;

        // Add the newly built group to the scene, then remove previous children (swap)
        scene.add(newGroup);
        previousChildren.forEach(child => scene.remove(child));

        // Publish new sprites as the current active sprites
        setCurrentSprites(tempSprites);
}
