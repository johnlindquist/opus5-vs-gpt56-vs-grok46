/* Lightweaver — puzzle definitions.
 * Data only. Nothing here knows how a ray behaves; the engine never reads
 * anything from this file except the fields it declares.
 *
 * Level format
 * ------------
 * {
 *   id, name, objective,          // objective text shown on the card
 *   width, height,                // logical board units (engine clips to this)
 *   pieces: [ ... ],              // see below
 *   solution: { pieceId: {x,y,angle} },   // one known-good arrangement
 *   hints: [stage1, stage2, stage3],      // staged text; stage 3 also ghosts
 *   hintPiece: pieceId            // piece the stage-2 hint highlights
 * }
 *
 * Piece kinds
 *   source   {x,y,angle,color:[r,g,b],intensity,nozzle}
 *   mirror   {x,y,angle,len}                       reflective both faces
 *   wall     {x,y,angle,len}                       absorbs
 *   filter   {x,y,angle,len,channel:'r'|'g'|'b'}   transmits one channel
 *   splitter {x,y,angle,len}                       50% reflect + 50% pass
 *   prism    {x,y,angle,size}                      dispersing glass triangle
 *   target   {x,y,r,color:[r,g,b],need}            need = min radiance
 *   sensor   {x,y,r}                               forbidden — must not be lit
 *
 * Any piece may carry `move:true` and/or `spin:true` to become interactive.
 * Angles are degrees, clockwise, 0 = +x (screen right).
 */
(function (root, factory) {
  var api = factory();
  root.LW_LEVELS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RED = [1, 0, 0], GREEN = [0, 1, 0], BLUE = [0, 0, 1];
  var WHITE = [1, 1, 1], YELLOW = [1, 1, 0];

  var LEVELS = [
    // ------------------------------------------------------------------ 1
    {
      id: 1, name: 'First Light',
      objective: 'Fold the crimson beam twice and land it on the ruby target.',
      width: 1200, height: 760,
      pieces: [
        { id: 'src', type: 'source', x: 70, y: 150, angle: 0, color: RED, intensity: 1 },
        { id: 'm1', type: 'mirror', x: 900, y: 150, angle: 45, len: 120, move: true, spin: true },
        { id: 'm2', type: 'mirror', x: 900, y: 560, angle: 105, len: 120, move: true, spin: true },
        { id: 'w1', type: 'wall', x: 620, y: 380, angle: 0, len: 300 },
        { id: 'w2', type: 'wall', x: 180, y: 330, angle: 90, len: 200 },
        { id: 't1', type: 'target', x: 300, y: 560, r: 22, color: RED, need: 0.3 }
      ],
      solution: { m1: { x: 900, y: 150, angle: 45 }, m2: { x: 900, y: 560, angle: 135 } },
      hintPiece: 'm2',
      hints: [
        'The upper mirror already turns the beam downward. Only the lower one is off.',
        'A mirror at 135° turns a downward beam back toward the left wall.',
        'Rotate the lower mirror to 135°. The ghost shows the resting place.'
      ],
      demo: { piece: 'm2', angle: 120 }
    },

    // ------------------------------------------------------------------ 2
    {
      id: 2, name: 'Split Decision',
      objective: 'One white beam, two colors. Split it, filter it, feed both targets.',
      width: 1200, height: 760,
      pieces: [
        { id: 'src', type: 'source', x: 70, y: 380, angle: 0, color: WHITE, intensity: 1 },
        { id: 'sp', type: 'splitter', x: 400, y: 380, angle: 45, len: 130, spin: true },
        { id: 'fr', type: 'filter', x: 700, y: 380, angle: 90, len: 150, channel: 'r' },
        { id: 'fb', type: 'filter', x: 400, y: 545, angle: 0, len: 150, channel: 'b' },
        { id: 'm1', type: 'mirror', x: 1000, y: 380, angle: 90, len: 120, move: true, spin: true },
        { id: 'm2', type: 'mirror', x: 400, y: 665, angle: 0, len: 120, move: true, spin: true },
        { id: 'w1', type: 'wall', x: 760, y: 620, angle: 0, len: 200 },
        { id: 'tr', type: 'target', x: 1000, y: 150, r: 22, color: RED, need: 0.2 },
        { id: 'tb', type: 'target', x: 830, y: 665, r: 22, color: BLUE, need: 0.2 }
      ],
      solution: {
        sp: { x: 400, y: 380, angle: 45 },
        m1: { x: 1000, y: 380, angle: 135 },
        m2: { x: 400, y: 665, angle: 45 }
      },
      hintPiece: 'm1',
      hints: [
        'The half-silvered plate passes half the light and reflects the rest.',
        'Each branch already has its filter. You only need to aim the two mirrors.',
        'Upper mirror to 135°, lower mirror to 45°.'
      ]
    },

    // ------------------------------------------------------------------ 3
    {
      id: 3, name: 'Spectrum',
      objective: 'Slide the prism into the white beam and fan it onto all three plates.',
      width: 1200, height: 760,
      pieces: [
        { id: 'src', type: 'source', x: 70, y: 190, angle: 0, color: WHITE, intensity: 1 },
        { id: 'pr', type: 'prism', x: 320, y: 245, size: 92, angle: 45, move: true, spin: true },
        { id: 'w1', type: 'wall', x: 700, y: 120, angle: 0, len: 420 },
        { id: 'w2', type: 'wall', x: 120, y: 640, angle: 90, len: 200 },
        { id: 'tr', type: 'target', x: 1040, y: 640, r: 26, color: RED, need: 0.22 },
        { id: 'tg', type: 'target', x: 942, y: 640, r: 26, color: GREEN, need: 0.22 },
        { id: 'tb', type: 'target', x: 844, y: 640, r: 26, color: BLUE, need: 0.22 }
      ],
      solution: { pr: { x: 380, y: 190, angle: 15 } },
      hintPiece: 'pr',
      hints: [
        'Glass bends blue harder than red — that is the whole trick.',
        'Lift the prism up into the white beam so the light enters one flat face.',
        'Prism to x 380, y 190, rotated to 15°. The ghost shows the calibrated pose.'
      ]
    },

    // ------------------------------------------------------------------ 4
    {
      id: 4, name: 'Silent Corridor',
      objective: 'Light the emerald plate. Any ray touching a watcher voids the run.',
      width: 1200, height: 760,
      pieces: [
        { id: 'src', type: 'source', x: 70, y: 120, angle: 0, color: GREEN, intensity: 1 },
        { id: 'm1', type: 'mirror', x: 1050, y: 120, angle: 60, len: 120, move: true, spin: true },
        { id: 'm2', type: 'mirror', x: 1050, y: 640, angle: 30, len: 120, move: true, spin: true },
        { id: 'm3', type: 'mirror', x: 700, y: 700, angle: 90, len: 120, move: true, spin: true },
        { id: 'w1', type: 'wall', x: 600, y: 380, angle: 0, len: 520 },
        { id: 'w2', type: 'wall', x: 200, y: 560, angle: 90, len: 200 },
        { id: 's1', type: 'sensor', x: 600, y: 250, r: 26 },
        { id: 's2', type: 'sensor', x: 860, y: 640, r: 26 },
        { id: 't1', type: 'target', x: 480, y: 640, r: 22, color: GREEN, need: 0.25 }
      ],
      solution: {
        m1: { x: 1050, y: 120, angle: 45 },
        m2: { x: 1050, y: 700, angle: 135 },
        m3: { x: 480, y: 700, angle: 45 }
      },
      hintPiece: 's2',
      hints: [
        'Watchers are not walls — a beam passes straight through one and still trips it.',
        'The obvious return lane at y 640 runs through the lower watcher. Go under it.',
        'Corner at 45°, run back along y 700, then turn up at x 480 into the plate.'
      ]
    },

    // ------------------------------------------------------------------ 5
    {
      id: 5, name: 'Grand Weave',
      objective: 'Mix red and green into amber, filter blue home, and stop the stray half-beam.',
      width: 1200, height: 760,
      pieces: [
        { id: 'srcR', type: 'source', x: 70, y: 180, angle: 0, color: RED, intensity: 1 },
        { id: 'srcG', type: 'source', x: 70, y: 600, angle: 0, color: GREEN, intensity: 1 },
        { id: 'srcW', type: 'source', x: 600, y: 40, angle: 90, color: WHITE, intensity: 1 },
        { id: 'm1', type: 'mirror', x: 900, y: 180, angle: 30, len: 120, move: true, spin: true },
        { id: 'm2', type: 'mirror', x: 900, y: 600, angle: 30, len: 120, move: true, spin: true },
        { id: 'sp', type: 'splitter', x: 600, y: 260, angle: 105, len: 130, spin: true },
        { id: 'm3', type: 'mirror', x: 260, y: 260, angle: 90, len: 120, move: true, spin: true },
        { id: 'fb', type: 'filter', x: 200, y: 500, angle: 0, len: 150, channel: 'b' },
        { id: 'w2', type: 'wall', x: 600, y: 700, angle: 0, len: 160, move: true },
        { id: 's1', type: 'sensor', x: 600, y: 520, r: 24 },
        { id: 'ty', type: 'target', x: 900, y: 390, r: 26, color: YELLOW, need: 0.22 },
        { id: 'tb', type: 'target', x: 200, y: 700, r: 22, color: BLUE, need: 0.14 }
      ],
      solution: {
        m1: { x: 900, y: 180, angle: 45 },
        m2: { x: 900, y: 600, angle: 135 },
        sp: { x: 600, y: 260, angle: 135 },
        m3: { x: 200, y: 260, angle: 135 },
        w2: { x: 600, y: 400 }
      },
      hintPiece: 'ty',
      hints: [
        'Amber is not a source colour here — it is red and green arriving at the same plate.',
        'The splitter keeps half the white beam travelling down toward the watcher. Something has to absorb it.',
        'Mirrors 45° / 135° / 135°, splitter 135°, and slide the shutter up to y 400.'
      ]
    }
  ];

  function clone(level) {
    return JSON.parse(JSON.stringify(level));
  }

  /** A fresh level with `solution` applied — used by tests and the hint ghost. */
  function solved(level) {
    var lv = clone(level);
    for (var i = 0; i < lv.pieces.length; i++) {
      var s = lv.solution[lv.pieces[i].id];
      if (s) {
        if (s.x != null) lv.pieces[i].x = s.x;
        if (s.y != null) lv.pieces[i].y = s.y;
        if (s.angle != null) lv.pieces[i].angle = s.angle;
      }
    }
    return lv;
  }

  return { LEVELS: LEVELS, clone: clone, solved: solved };
});
