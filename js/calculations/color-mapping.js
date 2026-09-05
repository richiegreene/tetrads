
/* No three.js here on purpose. This module is pure arithmetic over colours —
   nothing in it touches a scene — and keeping it that way means the colour
   model can be tested on its own, without a browser or a GPU. The import that
   used to sit here was unused. */

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
 * A layout is a ramp and the ground that ramp is drawn on — and, for the last
 * two, a body colour to be lit instead of a ramp to be read. Everything that
 * colours anything reads this one table: the panel's chips are painted by
 * sampling it, the tetrahedron's sprites are baked from it, and the triangle's
 * shading, contours, dots and surface all come out of it.
 *
 * THE GROUND IS A COLOUR, NOT A SWITCH.  It used to be black or white and the
 * code tested for 0xffffff to mean "light". It is now any colour — the bright
 * layouts sit on warm paper, pale blue-grey, blush and sage rather than on
 * hard white, because a white ground is a lamp pointed at the reader and a
 * tinted one is a page. Everything that used to compare against 0xffffff now
 * asks `isLightGround`, which is a luminance test, so adding a ground of any
 * shade is one line here.
 *
 * GRADIENT LAYOUTS vs CONSTANT LAYOUTS.  Most of these are ramps: value
 * becomes hue, and the 3D surface is coloured per-vertex so its height and its
 * colour say the same thing twice. That is legible, and it is also flat —
 * every facet is lit identically, so the shape reads as a contour map that
 * happens to be tilted.
 *
 * A CONSTANT layout does the opposite. The surface is one colour — the colour
 * YOU pick, from the swatch on the chip — and all of the modelling comes from
 * light: an angled key, a soft fill, and a specular highlight that slides
 * across the peaks as the shape turns. Height stops being redundant with
 * colour and starts being the only thing carrying the model, which is what
 * makes a shallow ridge you would miss in a ramp visible as a ridge. The flat
 * pane renders these as hillshading — the same light on the same surface, seen
 * from directly above — so the two panes stay two views of one thing.
 *
 * There are two of them because there are two grounds. What reads as a wet
 * slick on black is invisible on paper, and what reads as a glazed relief on
 * paper is a grey smudge on black — so each column ends with a constant of its
 * own, and each remembers its own colour.
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

const rgb = (hex) => ({
    r: ((hex >> 16) & 255) / 255,
    g: ((hex >> 8) & 255) / 255,
    b: (hex & 255) / 255,
});
const hexOf = ({ r, g, b }) => (
    (Math.round(Math.min(1, Math.max(0, r)) * 255) << 16)
    | (Math.round(Math.min(1, Math.max(0, g)) * 255) << 8)
    | Math.round(Math.min(1, Math.max(0, b)) * 255)
);

/** Rec. 709 relative luminance, 0..1. */
export function luminance(hex) {
    const c = rgb(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * Whether a ground counts as light — which decides the ink everything else is
 * drawn in, and whether the panel goes to day mode.
 *
 * A threshold rather than an equality test, so a ground can be cream or pale
 * sage rather than only #ffffff. Set well above mid so a mid-tone ground is
 * treated as dark, which is the safer way to be wrong: light ink on a medium
 * ground is dim, dark ink on a medium ground is unreadable.
 */
export function isLightGround(hex) {
    return luminance(hex) > 0.55;
}

/** A ground as CSS, for the canvas and the exporter. */
export function groundCss(hex) {
    return '#' + (hex >>> 0).toString(16).padStart(6, '0');
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

/* ---- the bright ramps ----
   These run the other way from the dark ones. On black the simplest chords
   come out brightest and glow; on paper they go to ink, so t rises from a
   mid tint into the darkest shade. Starting at the palest tint instead would
   put the most complex chords at the same value as the paper and lose them. */
const boneRamp   = rampFromStops([0xcbb894, 0xa8905f, 0x7d6738, 0x54421f, 0x2e2210]);
const mistRamp   = rampFromStops([0xa8b6c8, 0x7d8ea6, 0x566880, 0x35455c, 0x1b2635]);
const blushRamp  = rampFromStops([0xd7a8b4, 0xb87f92, 0x8f5468, 0x63313f, 0x381821]);
const sageRamp   = rampFromStops([0xa8c2a0, 0x7fa077, 0x587a52, 0x365434, 0x1c331c]);

/* ---------------------------------------------------------------------
 *  The two constants
 *
 *  Their colour is the user's, so it is state rather than a literal, and the
 *  entries below are resolved against it every time they are read. The
 *  defaults are the two materials this replaced — a black slick and a pale
 *  glaze — so the layouts open looking like themselves and the swatch is an
 *  invitation rather than a blank.
 * ------------------------------------------------------------------ */
export const constantColors = { dark: 0x15171c, light: 0xe8e4dc };

export function setConstantColor(which, hex) {
    if (which in constantColors) constantColors[which] = hex & 0xffffff;
}

/**
 * The highlight a body of this colour should throw.
 *
 * Not a fixed colour, because the same specular cannot serve both ends: a
 * black body has no diffuse to speak of and its shape exists ONLY where the
 * light catches it, so it needs a highlight far brighter than itself; a body
 * already near white needs one well under it, or the highlight clips whole
 * slopes flat and takes the relief with it. So the target brightness runs
 * opposite to the body's, and the hue is pulled most of the way to neutral —
 * a highlight is the colour of the lamp, not of the thing.
 */
function specularFor(hex) {
    const c = rgb(hex);
    const l = luminance(hex);
    /* The floor is not decoration. A pale body's highlight is dimmer than its
       own diffuse, so it can only show as the crests clipping to white — and
       below about 0.4 it does not reach even that, which made Gloss do
       nothing at all on a near-white constant. */
    const target = Math.min(0.88, Math.max(0.40, 1.12 - l * 1.25));
    const here = Math.max(0.02, l);
    const k = target / here;
    return hexOf({
        r: c.r * k * 0.35 + target * 0.65,
        g: c.g * k * 0.35 + target * 0.65,
        b: c.b * k * 0.35 + target * 0.68,
    });
}

/** A constant's ramp — what its dots, labels and contours are coloured by. */
function constantRamp(hex, lightGround) {
    const c = rgb(hex);
    const shade = (k) => hexOf({ r: c.r * k, g: c.g * k, b: c.b * k });
    const tint = (k) => hexOf({
        r: c.r + (1 - c.r) * k, g: c.g + (1 - c.g) * k, b: c.b + (1 - c.b) * k,
    });
    /* The lattice has to stay legible against the ground whatever colour the
       body is, so it is spread across the whole range from that colour rather
       than drawn in it: to ink on paper, to light on black. */
    return lightGround
        ? rampFromStops([tint(0.45), tint(0.15), shade(0.75), shade(0.42), shade(0.18)])
        : rampFromStops([shade(0.35), shade(0.7), hex, tint(0.35), tint(0.72)]);
}

function constantEntry(which, ground, name, title) {
    const hex = constantColors[which];
    const light = isLightGround(ground);
    return {
        name,
        title,
        constant: which,
        ground,
        ramp: constantRamp(hex, light),
        material: {
            color: hex,
            specular: specularFor(hex),
            shininess: 62,
            /* A dark body needs the fill kept down or the key cannot carve
               anything; a pale one needs it up or the shadows go to mud. */
            ambient: 0.14 + luminance(hex) * 0.34,
        },
    };
}

/**
 * @typedef {object} Colormap
 * @property {string} name        what the chip says
 * @property {string} title       what the chip's tooltip says
 * @property {(t:number)=>{r,g,b}} ramp
 * @property {number} ground      the background this layout is drawn on
 * @property {?string} constant   'dark'|'light' if its colour is the user's
 * @property {?object} material   present iff the 3D surface is lit rather than
 *                                value-coloured: `{ color, specular, shininess }`
 */

/* The order is the order the chips are laid out in, and the grid runs them
   down one column before starting the next — so the first six are the dark
   column and the last six the bright one, each ending in its constant. See
   `.maps` in style.css. */
const DARK = [
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
];

const BRIGHT = [
    {
        name: 'White', ramp: greyscaleColormap, ground: 0xffffff, material: null,
        title: 'Greyscale on hard white: the simplest chords go to ink — the layout to print.',
    },
    {
        name: 'Bone', ramp: boneRamp, ground: 0xf7f2e8, material: null,
        title: 'Sepia on warm paper. A tinted ground rather than hard white, which stops the page reading as a lamp.',
    },
    {
        name: 'Mist', ramp: mistRamp, ground: 0xeef1f6, material: null,
        title: 'Slate on pale blue-grey — the coolest of the bright layouts.',
    },
    {
        name: 'Blush', ramp: blushRamp, ground: 0xfaf0f1, material: null,
        title: 'Plum on soft pink.',
    },
    {
        name: 'Sage', ramp: sageRamp, ground: 0xeef3ed, material: null,
        title: 'Deep green on pale sage.',
    },
];

/** The layouts, in chip order, resolved against the current constant colours. */
export function colormaps() {
    return [
        ...DARK,
        constantEntry('dark', 0x000000, 'Constant',
            'One colour of your choosing on black, modelled entirely by light — the shape is read off the highlight rather than off a ramp. Pick it with the swatch.'),
        ...BRIGHT,
        constantEntry('light', 0xf4f4f2, 'Constant',
            'The same lighting on a pale ground: one colour of your choosing, glazed. Pick it with the swatch.'),
    ];
}

/** How many there are. Used by the cycling shortcut and the mode arithmetic. */
export const COLORMAP_COUNT = DARK.length + BRIGHT.length + 2;

/** The layout currently counted by `currentLayoutMode`. */
export function colormapAt(index) {
    const all = colormaps();
    return all[((index % all.length) + all.length) % all.length];
}

/**
 * Everything about a layout that a rendered picture depends on.
 *
 * The renderers cache what they have drawn, and they used to key that cache on
 * the layout's INDEX — which is wrong for the constants, whose colour can
 * change without the index moving. Anything holding a painted surface should
 * hold this beside it instead.
 */
export function layoutSignature(index) {
    const m = colormapAt(index);
    return `${index}|${m.ground}|${m.material ? m.material.color : 'ramp'}`;
}

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
 *   map rather than a light on it.
 *
 *   A CONSTANT layout is one colour modelled by light, so gloss runs its full
 *   range: at 0 the surface is MATTE — shaded by the key and the fill, with no
 *   highlight at all — and at 1 it is a mirror. The shading alone still
 *   carries the relief, so matte is a reading of the shape rather than the
 *   absence of one; how legible it is depends on the colour you picked, which
 *   is now yours to pick.
 *
 * @param {Colormap} map
 * @param {number} gloss 0..1
 */
export function lighting(map, gloss) {
    const g = Math.min(1, Math.max(0, gloss));
    const tint = (hex, k) => {
        const c = rgb(hex);
        return hexOf({ r: c.r * k, g: c.g * k, b: c.b * k });
    };

    if (map.material) {
        const m = map.material;
        return {
            material: true,
            color: m.color,
            ambient: m.ambient ?? 0.3,
            /* Straight through, with no floor under it: at 0 the specular is
               black, which is a matte surface — the diffuse shading is left to
               carry the relief on its own. */
            specular: tint(m.specular, g),
            /* A dull sheen is a broad one and a wet one is tight, so shininess
               rises too — otherwise turning gloss up would only make the same
               soft patch brighter until it clipped. */
            shininess: m.shininess + g * (118 - m.shininess),
            /* Still lit even at 0: `strength` says whether to shade at all,
               and a matte constant is shaded, just not shiny. */
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
