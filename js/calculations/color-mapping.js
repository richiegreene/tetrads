
import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

export function greyscaleColormap(value) {
    // Clamp value between 0 and 1
    value = Math.min(1, Math.max(0, value));

    // High complexity (blue in plasma, value=0) -> #AAAAAA
    // Low complexity (yellow in plasma, value=1) -> #000000
    const startColor = { r: 170/255, g: 170/255, b: 170/255 }; // #AAAAAA
    const endColor = { r: 0, g: 0, b: 0 }; // #000000

    const r = startColor.r + value * (endColor.r - startColor.r);
    const g = startColor.g + value * (endColor.g - startColor.g);
    const b = startColor.b + value * (endColor.b - startColor.b);

    return { r, g, b };
}

export function greyscaleBlackColormap(value) {
    value = Math.min(1, Math.max(0, value));
    const startColor = { r: 51/255, g: 51/255, b: 51/255 }; // #333333
    const endColor = { r: 1, g: 1, b: 1 }; // #FFFFFF
    const r = startColor.r + value * (endColor.r - startColor.r);
    const g = startColor.g + value * (endColor.g - startColor.g);
    const b = startColor.b + value * (endColor.b - startColor.b);
    return { r, g, b };
}

export const viridis_data = [
    [68,1,84],[68,2,85],[68,3,86],[68,4,87],[69,5,88],[69,6,89],[69,7,90],[69,8,91],[70,9,92],[70,10,93],[70,11,94],[70,12,95],[71,13,96],[71,14,97],[71,15,98],[71,16,99],[72,17,100],[72,18,101],[72,19,102],[72,20,103],[73,21,104],[73,22,105],[73,23,106],[73,24,107],[74,25,108],[74,26,109],[74,27,110],[74,28,111],[75,29,112],[75,30,113],[75,31,114],[75,32,115],[75,33,116],[76,34,117],[76,35,118],[76,36,119],[76,37,120],[76,38,121],[77,39,122],[77,40,123],[77,41,124],[77,42,125],[77,43,126],[77,44,127],[77,45,128],[78,46,129],[78,47,130],[78,48,131],[78,49,132],[78,50,133],[78,51,134],[78,52,135],[78,53,136],[78,54,137],[78,55,138],[78,56,139],[78,57,140],[78,58,141],[78,59,142],[77,60,143],[77,61,144],[77,62,145],[76,63,146],[76,64,146],[75,65,147],[75,66,148],[74,67,148],[74,68,149],[73,69,150],[73,70,150],[72,71,151],[71,72,152],[71,73,152],[70,74,153],[69,75,153],[69,76,154],[68,77,154],[67,78,155],[66,79,155],[66,80,156],[65,81,156],[64,82,156],[63,83,157],[62,84,157],[61,85,157],[60,86,157],[59,87,158],[58,88,158],[57,89,158],[56,90,158],[55,91,158],[54,92,158],[53,93,158],[52,94,158],[51,95,158],[50,96,158],[49,97,158],[48,98,158],[47,99,158],[46,100,158],[45,101,158],[44,102,157],[43,103,157],[42,104,157],[41,105,156],[40,106,156],[39,107,155],[38,108,154],[37,109,154],[36,110,153],[35,111,152],[34,112,151],[33,113,151],[32,114,150],[31,115,149],[31,116,148],[30,117,147],[29,118,146],[29,119,145],[28,120,144],[28,121,143],[27,122,142],[27,123,141],[26,124,140],[26,125,139],[26,126,138],[25,127,137],[25,128,136],[25,129,135],[25,130,134],[25,131,133],[25,132,132],[25,133,131],[25,134,130],[25,135,129],[26,136,128],[26,137,127],[27,138,126],[27,139,125],[28,140,124],[29,141,123],[30,142,122],[31,143,121],[32,144,120],[33,145,119],[34,146,118],[35,147,117],[36,148,116],[37,149,115],[38,150,114],[39,151,113],[40,152,112],[41,153,111],[42,154,110],[43,155,109],[44,156,108],[45,157,107],[46,158,106],[48,159,105],[49,160,104],[50,161,103],[52,162,102],[53,163,101],[55,164,100],[56,165,99],[58,166,98],[59,167,97],[61,168,96],[62,169,95],[64,170,94],[66,171,93],[67,172,92],[69,173,91],[71,174,90],[72,175,89],[74,176,88],[76,177,87],[78,178,86],[80,179,85],[82,180,84],[84,181,83],[86,182,82],[88,183,81],[90,184,80],[92,185,79],[94,186,78],[96,187,77],[98,188,76],[100,189,75],[102,190,74],[104,191,73],[106,192,72],[108,193,71],[110,194,70],[112,195,69],[114,196,68],[116,197,67],[118,198,66],[120,199,65],[122,200,64],[124,201,63],[126,202,62],[128,203,61],[130,204,60],[132,205,59],[134,206,58],[136,207,57],[138,208,56],[140,209,55],[142,210,54],[144,211,53],[146,212,52],[148,213,51],[150,214,50],[152,215,49],[154,216,48],[156,217,47],[158,218,46],[160,219,45],[162,220,44],[164,221,43],[166,222,42],[168,223,41],[170,224,40],[172,225,39],[174,226,38],[176,227,37],[178,228,36],[180,229,35],[182,230,34],[184,231,33],[186,232,32],[188,233,31],[190,234,30],[192,235,29],[194,236,28],[196,237,27],[198,238,26],[200,239,25],[202,240,24],[204,241,23],[206,242,22],[208,243,21],[210,244,20],[212,245,19],[214,246,18],[216,247,17],[218,248,16],[220,249,15],[222,250,14],[224,251,13],[226,252,12],[228,253,11],[230,254,10],[232,255,9],[234,255,8],[236,255,7],[238,255,6],[240,255,5],[242,255,4],[244,255,3],[246,255,2],[248,255,1],[250,255,0]
].map(c => ({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 }));

export function viridisColormap(value) {
    value = Math.min(1, Math.max(0, value));
    const index = Math.floor(value * (viridis_data.length - 1));
    return viridis_data[index];
}

// Plasma Colormap function
export function plasmaColormap(value) {
    // Clamp value between 0 and 1
    value = Math.min(1, Math.max(0, value));

    const colors = [
        { r: 13/255, g: 8/255, b: 135/255 },   // #0d0887
        { r: 75/255, g: 3/255, b: 161/255 },   // #4b03a1
        { r: 133/255, g: 15/255, b: 186/255 },  // #850fba
        { r: 185/255, g: 36/255, b: 177/255 },  // #b924b1
        { r: 229/255, g: 74/255, b: 157/255 },  // #e54a9d
        { r: 254/255, g: 113/255, b: 126/255 }, // #fe717e
        { r: 255/255, g: 156/255, b: 84/255 },  // #ff9c54
        { r: 255/255, g: 199/255, b: 40/255 },  // #ffc728
        { r: 249/255, g: 248/255, b: 10/255 },  // #f9f80a
        { r: 240/255, g: 249/255, b: 33/255 }   // #f0f921
    ];
    const stops = [0, 1/9, 2/9, 3/9, 4/9, 5/9, 6/9, 7/9, 8/9, 1];

    // Find the segment index
    let i = 0;
    for (let j = 0; j < stops.length - 1; j++) {
        if (value >= stops[j] && value <= stops[j + 1]) {
            i = j;
            break;
        }
    }
    // Handle the case where value is exactly 1, it should map to the last color
    if (value === 1) {
        i = stops.length - 2; // This ensures endColor is colors[stops.length - 1]
    }

    const startColor = colors[i];
    const endColor = colors[i + 1];
    const startStop = stops[i];
    const endStop = stops[i + 1];

    let factor = 0;
    if (endStop !== startStop) {
        factor = (value - startStop) / (endStop - startStop);
    }

    const r = startColor.r + factor * (endColor.r - startColor.r);
    const g = startColor.g + factor * (endColor.g - startColor.g);
    const b = startColor.b + factor * (endColor.b - startColor.b);

    return { r: r, g: g, b: b };
}

/* =====================================================================
 *  THE COLOUR LAYOUTS
 * =====================================================================
 *
 * A layout is a ramp, the ground that ramp is drawn on, and — for some of
 * them — a material. Everything that colours anything reads this one table:
 * the panel's chips are painted by sampling it, the tetrahedron's sprites are
 * baked from it, and the triangle's shading, contours, dots and surface all
 * come out of it. It used to be three parallel lists (a switch in the updater,
 * a table in the panel, and LAYOUT_GROUNDS) that had to be kept in the same
 * order by hand; adding a colour to one of them and not the others was a chip
 * that advertised a ramp the scene did not use.
 *
 * GRADIENT LAYOUTS vs MATERIAL LAYOUTS.  Most of these are ramps: value
 * becomes hue, and the 3D surface is coloured per-vertex so its height and its
 * colour say the same thing twice. That is legible, and it is also flat —
 * every facet is lit identically, so the shape reads as a contour map that
 * happens to be tilted.
 *
 * A material layout does the opposite. The surface is ONE colour, and all of
 * the modelling comes from light: an angled key, a soft fill, and a specular
 * highlight that slides across the peaks as the shape turns. Height stops
 * being redundant with colour and starts being the only thing carrying the
 * model, which is what makes a shallow ridge you would miss in a ramp visible
 * as a ridge. The flat pane renders these as hillshading — the same light on
 * the same surface, seen from directly above — so the two panes stay two views
 * of one thing rather than two different pictures.
 *
 * A material still carries a ramp, because the tetrahedron is sprites with no
 * surface to light, and because the dots and contours on the triangle have to
 * be coloured by something.
 * ------------------------------------------------------------------ */

/** A ramp through a list of hex stops, evenly spaced. */
function rampFromStops(hexes) {
    const stops = hexes.map((h) => ({
        r: ((h >> 16) & 255) / 255,
        g: ((h >> 8) & 255) / 255,
        b: (h & 255) / 255,
    }));
    return (value) => {
        const t = Math.min(1, Math.max(0, value)) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(t));
        const f = t - i;
        const a = stops[i], b = stops[i + 1];
        return { r: a.r + f * (b.r - a.r), g: a.g + f * (b.g - a.g), b: a.b + f * (b.b - a.b) };
    };
}

const magmaRamp = rampFromStops([
    0x000004, 0x1c1044, 0x4f127b, 0x812581, 0xb5367a, 0xe55064, 0xfb8761, 0xfec287, 0xfcfdbf,
]);

/* Isoharmonics' own gradient, stop for stop — the blue the triangle has always
   been drawn in there, so a harmonic entropy map made here can sit beside one
   made in that app and be the same picture. */
const blueRamp = rampFromStops([
    0x23262f, 0x1e1861, 0x1a0ebe, 0x0437f2, 0x7895fc, 0xa7c6ed, 0xd0e1f9, 0xf0f4ff, 0xffffff,
]);

/* Oil on water: near-black at the bottom, and what little colour there is
   arrives as the cold iridescence a slick throws rather than as a hue of its
   own. Kept dark for most of its range — a petroleum that brightened evenly
   would just be a blue ramp. */
const petroleumRamp = rampFromStops([
    0x05060a, 0x0b0f18, 0x122232, 0x1a3b46, 0x27604f, 0x4a6a80, 0x8c8bad, 0xd6d9e4,
]);

const porcelainRamp = rampFromStops([
    0xf4f2ee, 0xd8d4cc, 0xb0aaa0, 0x807a72, 0x504b46, 0x2a2724,
]);

/**
 * @typedef {object} Colormap
 * @property {string} name        what the chip says
 * @property {string} title       what the chip's tooltip says
 * @property {(t:number)=>{r,g,b}} ramp
 * @property {number} ground      the background this layout is drawn on
 * @property {?object} material   present iff the 3D surface is lit rather than
 *                                value-coloured: `{ color, specular, shininess }`
 */
export const COLORMAPS = [
    {
        name: 'Plasma', ramp: plasmaColormap, ground: 0x000000, material: null,
        title: 'Perceptually uniform, dark blue through magenta to yellow.',
    },
    {
        name: 'Viridis', ramp: viridisColormap, ground: 0x000000, material: null,
        title: 'Perceptually uniform, deep violet through green to yellow.',
    },
    {
        name: 'Magma', ramp: magmaRamp, ground: 0x000000, material: null,
        title: 'Perceptually uniform, near-black through crimson to cream — the darkest of the ramps, so isolated peaks carry.',
    },
    {
        name: 'Blue', ramp: blueRamp, ground: 0x000000, material: null,
        title: "Isoharmonics' own gradient, stop for stop: slate through cobalt to white.",
    },
    {
        name: 'Black', ramp: greyscaleBlackColormap, ground: 0x000000, material: null,
        title: 'Greyscale on a black ground: the simplest chords come out brightest.',
    },
    {
        name: 'White', ramp: greyscaleColormap, ground: 0xffffff, material: null,
        title: 'Greyscale on a white ground: the simplest chords come out darkest — the layout to print.',
    },
    {
        name: 'Petroleum', ramp: petroleumRamp, ground: 0x000000,
        /* The one case where the specular is far BRIGHTER than the body. A
           black surface has no diffuse to speak of, so the highlight is not an
           accent on the shading — it is the entire reading of the shape, and
           the relief exists only where the light catches it. */
        material: { color: 0x15171c, specular: 0x9fb4c6, shininess: 70, ambient: 0.16 },
        title: 'A black slick: almost no body, so the shape is read entirely off the cold sheen the light leaves on it. Raise Gloss to wet it further.',
    },
    {
        name: 'Porcelain', ramp: porcelainRamp, ground: 0xffffff,
        /* The opposite case: a pale body already near white, so the specular
           has to stay well under it or the highlight clips whole slopes flat
           and takes the relief with it. */
        material: { color: 0xe8e4dc, specular: 0x7d7a73, shininess: 48, ambient: 0.42 },
        title: 'The same lighting on a pale glaze over a white ground — the material layout to print.',
    },
];

/**
 * How a layout is lit, at this Gloss setting.
 *
 * Gloss is one control over two quite different situations, and it does not
 * mean the same thing to both — which is the whole reason the arithmetic is
 * here rather than duplicated in the two renderers.
 *
 *   A GRADIENT layout is not lit at all. Its colours ARE the values, and
 *   shading them by the local slope would make the map lie about its own
 *   numbers. So gloss adds only a highlight over the top — a varnish on the
 *   map rather than a light on it — and it starts at NOTHING. At the default
 *   these layouts are pixel-for-pixel the flat surfaces they always were, and
 *   the slider is something you turn up if you want it.
 *
 *   A MATERIAL layout is nothing BUT light: a black slick has no diffuse worth
 *   speaking of, and its shape exists only where the highlight catches it. So
 *   its sheen does not start at nothing — it starts at most of the way up and
 *   the slider wets it further. A material at true zero would be a black slab
 *   with the relief invisible inside it, which is not a duller version of the
 *   layout, it is the absence of one.
 *
 * @param {Colormap} map
 * @param {number} gloss 0..1
 */
export function lighting(map, gloss) {
    const g = Math.min(1, Math.max(0, gloss));
    const tint = (hex, k) => {
        const r = Math.round(Math.min(255, ((hex >> 16) & 255) * k));
        const gg = Math.round(Math.min(255, ((hex >> 8) & 255) * k));
        const b = Math.round(Math.min(255, (hex & 255) * k));
        return (r << 16) | (gg << 8) | b;
    };

    if (map.material) {
        const m = map.material;
        return {
            material: true,
            color: m.color,
            ambient: m.ambient ?? 0.3,
            /* Floored, so the layout is always legible, and headroom above its
               designed value so the slider has somewhere to go. */
            specular: tint(m.specular, 0.5 + 0.85 * g),
            /* A dull sheen is a broad one and a wet one is tight, so shininess
               rises too — otherwise turning gloss up would only make the same
               soft patch brighter until it clipped. */
            shininess: m.shininess + g * (118 - m.shininess),
            strength: 1,
        };
    }

    return {
        material: false,
        color: 0xffffff,
        ambient: 1,
        specular: tint(0xffffff, g * 0.55),
        shininess: 10 + g * 84,
        strength: g,
    };
}

/** The layout currently counted by `currentLayoutMode`. */
export function colormapAt(index) {
    return COLORMAPS[((index % COLORMAPS.length) + COLORMAPS.length) % COLORMAPS.length];
}
