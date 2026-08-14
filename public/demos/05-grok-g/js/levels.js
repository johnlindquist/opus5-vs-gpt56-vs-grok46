/**
 * Five handcrafted Lightweaver laboratories.
 * Geometry is in world units (1000 × 620). Pieces are the only mutable state.
 */
(function (root) {
  "use strict";

  var W = 1000;
  var H = 620;

  function deg(d) {
    return (d * Math.PI) / 180;
  }

  var LEVELS = [
    {
      id: "1",
      name: "First Reflection",
      subtitle: "Twin galleries",
      objective:
        "Finish aligning the lower crimson mirror so the red beam reaches the ruby aperture. The teal gallery is already locked.",
      hintStages: [
        "Select the free silver mirror on the lower red path — it is the only rotatable crimson-route piece.",
        "Rotate it toward 45° (Q / E, the wheel, or the orbit handles) until the descending beam turns fully east.",
        "The ruby target sits on the same height as that mirror. A true 45° fold sends the beam straight into it.",
      ],
      demo: { pieceId: "m-red-2", fromAngle: deg(28), toAngle: deg(36), duration: 900 },
      walls: [
        { id: "rail-a", x1: 200, y1: 250, x2: 430, y2: 250 },
        { id: "rail-b", x1: 200, y1: 370, x2: 430, y2: 370 },
      ],
      sources: [
        { id: "src-red", x: 64, y: 108, angle: 0, color: [1, 0.12, 0.08], label: "Crimson" },
        { id: "src-teal", x: 64, y: 528, angle: 0, color: [0.1, 0.85, 0.78], label: "Teal" },
      ],
      pieces: [
        {
          id: "m-red-1",
          type: "mirror",
          x: 560,
          y: 108,
          angle: deg(45),
          length: 92,
          movable: false,
          rotatable: false,
        },
        {
          id: "m-red-2",
          type: "mirror",
          x: 560,
          y: 500,
          angle: deg(28),
          length: 92,
          movable: true,
          rotatable: true,
        },
        {
          id: "m-teal-1",
          type: "mirror",
          x: 168,
          y: 528,
          angle: deg(-45),
          length: 88,
          movable: false,
          rotatable: false,
        },
        {
          id: "m-teal-2",
          type: "mirror",
          x: 168,
          y: 200,
          angle: deg(-45),
          length: 88,
          movable: false,
          rotatable: false,
        },
      ],
      targets: [
        { id: "t-red", x: 900, y: 500, color: [1, 0.12, 0.08], radius: 24, minIntensity: 0.32, label: "Ruby" },
        { id: "t-teal", x: 900, y: 200, color: [0.1, 0.85, 0.78], radius: 24, minIntensity: 0.32, label: "Teal" },
      ],
      sensors: [],
    },
    {
      id: "2",
      name: "Binary Mix",
      subtitle: "Additive color",
      objective:
        "Fold the crimson and verdant beams onto the same gold aperture. The target accepts yellow — both channels must arrive with strength.",
      hintStages: [
        "Each source needs its own fold. The upper mirror should send red downward; the lower should send green upward.",
        "Aim both 45° folds so the beams share the gold target’s vertical column.",
        "Victory requires mixed yellow, not a single primary. If only one ring lights, the other mirror is still off-axis.",
      ],
      walls: [
        { id: "baffle", x1: 180, y1: 300, x2: 380, y2: 300 },
      ],
      sources: [
        { id: "src-r", x: 70, y: 120, angle: 0, color: [1, 0.05, 0.05], label: "Red" },
        { id: "src-g", x: 70, y: 500, angle: 0, color: [0.08, 1, 0.12], label: "Green" },
      ],
      pieces: [
        {
          id: "mix-top",
          type: "mirror",
          x: 640,
          y: 120,
          angle: deg(18),
          length: 100,
          movable: true,
          rotatable: true,
        },
        {
          id: "mix-bot",
          type: "mirror",
          x: 640,
          y: 500,
          angle: deg(-18),
          length: 100,
          movable: true,
          rotatable: true,
        },
      ],
      targets: [
        { id: "t-gold", x: 640, y: 310, color: [1, 0.92, 0.12], radius: 26, minIntensity: 0.55, label: "Gold mix" },
      ],
      sensors: [],
    },
    {
      id: "3",
      name: "Dichroic Gate",
      subtitle: "Split and filter",
      objective:
        "A white beam must be divided. Transmit red through the scarlet plate; reflect the remainder through the verdant plate. Keep both monochrome apertures fed.",
      hintStages: [
        "The splitter is the first decision. A 45° plate reflects part of the white beam down and lets the rest continue.",
        "Place the red filter on the transmitted (east) path and the green filter on the reflected (south) path.",
        "You may still need the small fold mirror after the green filter so the verdant target can see the beam.",
      ],
      walls: [
        { id: "hood", x1: 820, y1: 280, x2: 820, y2: 430 },
      ],
      sources: [
        { id: "src-w", x: 60, y: 160, angle: 0, color: [1, 1, 1], label: "White" },
      ],
      pieces: [
        {
          id: "split-a",
          type: "splitter",
          x: 340,
          y: 160,
          angle: deg(32),
          length: 96,
          movable: true,
          rotatable: true,
        },
        {
          id: "fil-red",
          type: "filter",
          x: 560,
          y: 160,
          angle: deg(90),
          length: 78,
          tint: [1, 0.04, 0.04],
          movable: true,
          rotatable: true,
        },
        {
          id: "fil-green",
          type: "filter",
          x: 340,
          y: 340,
          angle: 0,
          length: 78,
          tint: [0.04, 1, 0.04],
          movable: true,
          rotatable: true,
        },
        {
          id: "fold-g",
          type: "mirror",
          x: 340,
          y: 500,
          angle: deg(22),
          length: 90,
          movable: true,
          rotatable: true,
        },
      ],
      targets: [
        { id: "t-r", x: 880, y: 160, color: [1, 0.08, 0.08], radius: 24, minIntensity: 0.18, label: "Scarlet" },
        { id: "t-g", x: 880, y: 500, color: [0.08, 1, 0.1], radius: 24, minIntensity: 0.18, label: "Verdant" },
      ],
      sensors: [],
    },
    {
      id: "4",
      name: "Dispersion Loom",
      subtitle: "Prism triad",
      objective:
        "A white beam entering the prism must fan into scarlet, verdant, and azure. Rotate the prism until each primary finds its matching aperture.",
      hintStages: [
        "White must strike a prism face. Drag the prism onto the beam if the fan has not appeared.",
        "Small rotations change which colors climb or dive. Watch the three threads independently.",
        "If a color is close, nudge with Q / E rather than dragging. The apertures sit on a vertical column at the east wall.",
      ],
      walls: [],
      sources: [
        { id: "src-w4", x: 70, y: 310, angle: 0, color: [1, 1, 1], label: "White" },
      ],
      pieces: [
        {
          id: "prism-1",
          type: "prism",
          x: 300,
          y: 318,
          angle: deg(-18),
          radius: 52,
          movable: true,
          rotatable: true,
        },
        {
          id: "m-r4",
          type: "mirror",
          x: 620,
          y: 150,
          angle: deg(20),
          length: 88,
          movable: true,
          rotatable: true,
        },
        {
          id: "m-b4",
          type: "mirror",
          x: 620,
          y: 470,
          angle: deg(-20),
          length: 88,
          movable: true,
          rotatable: true,
        },
      ],
      targets: [
        { id: "t-r4", x: 900, y: 120, color: [1, 0.06, 0.06], radius: 22, minIntensity: 0.12, label: "Scarlet" },
        { id: "t-g4", x: 900, y: 310, color: [0.06, 1, 0.08], radius: 22, minIntensity: 0.12, label: "Verdant" },
        { id: "t-b4", x: 900, y: 500, color: [0.1, 0.25, 1], radius: 22, minIntensity: 0.12, label: "Azure" },
      ],
      sensors: [],
    },
    {
      id: "5",
      name: "Silent Corridor",
      subtitle: "Avoid the sensor",
      objective:
        "Deliver crimson to the far aperture without illuminating the forbidden sensor. The straight shot is a trap — fold around the baffle.",
      hintStages: [
        "The octagonal sensor sits on the obvious eastbound line. Any glow on it fails the lab.",
        "Use the two free mirrors to walk the beam north of the baffle, then east, then south into the target.",
        "Keep the splitter parked so it does not dump a ghost beam into the sensor. A parked splitter off the path is a valid solution.",
      ],
      walls: [
        { id: "baffle-v", x1: 520, y1: 90, x2: 520, y2: 430 },
        { id: "baffle-h", x1: 520, y1: 430, x2: 740, y2: 430 },
      ],
      sources: [
        { id: "src-r5", x: 70, y: 500, angle: 0, color: [1, 0.1, 0.08], label: "Crimson" },
      ],
      pieces: [
        {
          id: "m5-a",
          type: "mirror",
          x: 220,
          y: 500,
          angle: deg(-12),
          length: 96,
          movable: true,
          rotatable: true,
        },
        {
          id: "m5-b",
          type: "mirror",
          x: 220,
          y: 48,
          angle: deg(8),
          length: 96,
          movable: true,
          rotatable: true,
        },
        {
          id: "m5-c",
          type: "mirror",
          x: 860,
          y: 48,
          angle: deg(50),
          length: 96,
          movable: true,
          rotatable: true,
        },
        {
          id: "split-trap",
          type: "splitter",
          x: 400,
          y: 360,
          angle: deg(45),
          length: 80,
          movable: true,
          rotatable: true,
        },
      ],
      targets: [
        { id: "t-r5", x: 860, y: 500, color: [1, 0.1, 0.08], radius: 24, minIntensity: 0.28, label: "Ruby" },
      ],
      sensors: [{ id: "alarm", x: 400, y: 500, w: 44, h: 44 }],
    },
  ];

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function getLevel(index) {
    var i = clampIndex(index);
    var lvl = clone(LEVELS[i]);
    lvl.index = i;
    lvl.width = W;
    lvl.height = H;
    return lvl;
  }

  function clampIndex(index) {
    var i = index | 0;
    if (i < 0) i = 0;
    if (i > LEVELS.length - 1) i = LEVELS.length - 1;
    return i;
  }

  var api = {
    WORLD_W: W,
    WORLD_H: H,
    COUNT: LEVELS.length,
    getLevel: getLevel,
    clone: clone,
    deg: deg,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.LightweaverLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
