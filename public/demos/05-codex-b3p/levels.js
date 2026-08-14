(function (root) {
  "use strict";
  const C = {
    red: { r: 1, g: .02, b: .01 },
    green: { r: .02, g: 1, b: .03 },
    blue: { r: .02, g: .08, b: 1 },
    white: { r: 1, g: 1, b: 1 }
  };
  const boundary = [
    { id: "top", type: "wall", x: 600, y: 34, length: 1120, angle: 0 },
    { id: "bottom", type: "wall", x: 600, y: 646, length: 1120, angle: 0 },
    { id: "left", type: "wall", x: 40, y: 340, length: 612, angle: Math.PI / 2 },
    { id: "right", type: "wall", x: 1160, y: 340, length: 612, angle: Math.PI / 2 }
  ];
  const mirror = (id, x, y, angle, extra = {}) => ({ id, type: "mirror", x, y, angle, length: 92, movable: true, ...extra });

  const levels = [
    {
      id: "first-reflections", name: "First Reflections",
      objective: "Complete both reflected paths. The blue circuit is close, but not yet aligned.",
      hint: ["Follow the blue beam to its final mirror.", "The upper blue mirror should sit on the target’s horizontal axis.", "Move M4 upward to y = 300."],
      sources: [
        { id: "s-red", x: 82, y: 500, angle: 0, color: C.red },
        { id: "s-blue", x: 82, y: 600, angle: 0, color: C.blue }
      ],
      targets: [
        { id: "t-red", x: 1080, y: 180, radius: 22, required: ["r"], label: "RED" },
        { id: "t-blue", x: 1080, y: 300, radius: 22, required: ["b"], label: "BLUE" }
      ],
      walls: boundary,
      pieces: [
        mirror("m1", 350, 500, -Math.PI / 4, { movable: false }),
        mirror("m2", 350, 180, -Math.PI / 4, { movable: false }),
        mirror("m3", 600, 600, -Math.PI / 4),
        mirror("m4", 600, 340, -Math.PI / 4, { solution: { x: 600, y: 300, angle: -Math.PI / 4 } })
      ]
    },
    {
      id: "selective-spectrum", name: "Selective Spectrum",
      objective: "Split white light, then isolate red and blue into their matching receivers.",
      hint: ["A splitter both transmits and reflects.", "Each branch needs its own color filter.", "Lower the red filter onto the horizontal branch at y = 340."],
      sources: [{ id: "s-white", x: 90, y: 340, angle: 0, color: C.white }],
      targets: [
        { id: "t-red", x: 1050, y: 340, radius: 22, required: ["r"], label: "RED" },
        { id: "t-blue", x: 400, y: 90, radius: 22, required: ["b"], label: "BLUE" }
      ],
      walls: boundary,
      pieces: [
        { id: "split", type: "splitter", x: 400, y: 340, angle: -Math.PI / 4, length: 100, movable: true },
        { id: "blue-filter", type: "filter", channel: "b", x: 400, y: 190, angle: 0, length: 90, movable: true },
        { id: "red-filter", type: "filter", channel: "r", x: 650, y: 410, angle: Math.PI / 2, length: 90, movable: true, solution: { x: 650, y: 340, angle: Math.PI / 2 } }
      ]
    },
    {
      id: "chromatic-fan", name: "Chromatic Fan",
      objective: "Tune the prism to resolve white light into three precise spectral channels.",
      hint: ["The prism’s rotation biases the entire spectral fan.", "Green should travel straight through the center.", "Rotate the prism back to 0°."],
      sources: [{ id: "s-white", x: 90, y: 340, angle: 0, color: C.white }],
      targets: [
        { id: "t-red", x: 1030, y: 251, radius: 24, required: ["r"], label: "RED" },
        { id: "t-green", x: 1030, y: 340, radius: 24, required: ["g"], label: "GREEN" },
        { id: "t-blue", x: 1030, y: 429, radius: 24, required: ["b"], label: "BLUE" }
      ],
      walls: boundary,
      pieces: [
        { id: "prism", type: "prism", x: 350, y: 340, angle: .18, length: 92, movable: true, solution: { x: 350, y: 340, angle: 0 } }
      ]
    },
    {
      id: "silent-crossing", name: "Silent Crossing",
      objective: "Reach the red receiver without allowing any beam to cross the forbidden sensor.",
      hint: ["The striped sensor records light but does not stop it.", "Intercept the beam before it reaches the sensor.", "Move the lower mirror left of x = 700, keeping it on y = 520."],
      sources: [{ id: "s-red", x: 90, y: 520, angle: 0, color: C.red }],
      targets: [{ id: "t-red", x: 1050, y: 180, radius: 22, required: ["r"], label: "RED" }],
      sensors: [{ id: "danger", type: "sensor", x: 700, y: 520, angle: Math.PI / 2, length: 180, threshold: .05 }],
      walls: boundary,
      pieces: [
        mirror("lower", 790, 520, -Math.PI / 4, { solution: { x: 350, y: 520, angle: -Math.PI / 4 } }),
        mirror("upper", 350, 180, -Math.PI / 4)
      ]
    },
    {
      id: "convergence", name: "Convergence",
      objective: "Converge independent red and blue rays in the magenta receiver.",
      hint: ["The receiver needs both channels at once.", "Aim each mirror halfway between its incoming and desired outgoing ray.", "Set the upper mirror near 13° and the lower near −8°."],
      sources: [
        { id: "s-red", x: 90, y: 250, angle: 0, color: C.red },
        { id: "s-blue", x: 90, y: 580, angle: 0, color: C.blue }
      ],
      targets: [{ id: "t-magenta", x: 900, y: 500, radius: 26, required: ["r", "b"], wrongTolerance: .2, label: "MAGENTA" }],
      walls: boundary,
      pieces: [
        mirror("red-aim", 400, 250, .12, { solution: { x: 400, y: 250, angle: .2318 } }),
        mirror("blue-aim", 400, 580, -.03, { solution: { x: 400, y: 580, angle: -.0793 } })
      ]
    }
  ];

  root.LightLevels = levels;
})(typeof window !== "undefined" ? window : globalThis);
