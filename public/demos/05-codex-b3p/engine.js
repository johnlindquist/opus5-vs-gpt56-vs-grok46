(function (root) {
  "use strict";

  const EPSILON = 0.08;
  const MAX_BOUNCES = 18;
  const MAX_RAYS = 180;

  const V = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    mul: (a, n) => ({ x: a.x * n, y: a.y * n }),
    dot: (a, b) => a.x * b.x + a.y * b.y,
    len: a => Math.hypot(a.x, a.y),
    norm(a) { const n = V.len(a) || 1; return { x: a.x / n, y: a.y / n }; },
    fromAngle: a => ({ x: Math.cos(a), y: Math.sin(a) }),
    angle: a => Math.atan2(a.y, a.x)
  };

  function lineIntersection(origin, direction, a, b) {
    const edge = V.sub(b, a);
    const cross = direction.x * edge.y - direction.y * edge.x;
    if (Math.abs(cross) < 1e-9) return null;
    const ao = V.sub(a, origin);
    const t = (ao.x * edge.y - ao.y * edge.x) / cross;
    const u = (ao.x * direction.y - ao.y * direction.x) / cross;
    if (t > EPSILON && u >= -1e-8 && u <= 1 + 1e-8) {
      return { t, u, point: V.add(origin, V.mul(direction, t)) };
    }
    return null;
  }

  function reflect(direction, surfaceNormal) {
    const n = V.norm(surfaceNormal);
    return V.norm(V.sub(direction, V.mul(n, 2 * V.dot(direction, n))));
  }

  function segmentFor(item) {
    const half = item.length / 2;
    // The prism's visual rotation controls dispersion; its simplified entry
    // face remains perpendicular to that visual axis.
    const segmentAngle = (item.angle || 0) + (item.type === "prism" ? Math.PI / 2 : 0);
    const d = V.fromAngle(segmentAngle);
    return {
      a: { x: item.x - d.x * half, y: item.y - d.y * half },
      b: { x: item.x + d.x * half, y: item.y + d.y * half },
      normal: { x: -d.y, y: d.x }
    };
  }

  function rayCircle(origin, direction, center, radius, maxT) {
    const oc = V.sub(center, origin);
    const projection = V.dot(oc, direction);
    if (projection < 0 || projection > maxT) return null;
    const closest = V.add(origin, V.mul(direction, projection));
    const dist = V.len(V.sub(center, closest));
    if (dist > radius) return null;
    const offset = Math.sqrt(Math.max(0, radius * radius - dist * dist));
    return Math.max(0, projection - offset);
  }

  function cloneColor(c) { return { r: c.r || 0, g: c.g || 0, b: c.b || 0 }; }
  function colorEnergy(c) { return Math.max(c.r, c.g, c.b); }
  function scaleColor(c, n) { return { r: c.r * n, g: c.g * n, b: c.b * n }; }
  function filterColor(c, channel) {
    return { r: channel === "r" ? c.r : 0, g: channel === "g" ? c.g : 0, b: channel === "b" ? c.b : 0 };
  }

  function propagate(level, pieces) {
    const colliders = [];
    [...(level.walls || []), ...pieces].forEach(item => {
      if (["mirror", "filter", "splitter", "prism", "wall"].includes(item.type)) {
        colliders.push({ item, ...segmentFor(item) });
      }
    });
    const targetEnergy = {};
    (level.targets || []).forEach(t => { targetEnergy[t.id] = { r: 0, g: 0, b: 0 }; });
    const forbiddenHits = {};
    const segments = [];
    const queue = level.sources.map(source => ({
      origin: { x: source.x, y: source.y },
      direction: V.fromAngle(source.angle),
      color: cloneColor(source.color),
      bounce: 0,
      sourceId: source.id
    }));

    let processed = 0;
    while (queue.length && processed++ < MAX_RAYS) {
      const ray = queue.shift();
      if (ray.bounce > MAX_BOUNCES || colorEnergy(ray.color) < 0.018) continue;
      let nearest = null;
      for (const collider of colliders) {
        const hit = lineIntersection(ray.origin, ray.direction, collider.a, collider.b);
        if (hit && (!nearest || hit.t < nearest.hit.t)) nearest = { collider, hit };
      }
      const maxDistance = nearest ? nearest.hit.t : 1700;
      const attenuation = Math.pow(0.985, maxDistance / 50);
      const end = V.add(ray.origin, V.mul(ray.direction, maxDistance));
      const endColor = scaleColor(ray.color, attenuation);
      segments.push({ a: ray.origin, b: end, colorA: ray.color, colorB: endColor, bounce: ray.bounce });

      for (const target of level.targets || []) {
        const t = rayCircle(ray.origin, ray.direction, target, target.radius || 20, maxDistance);
        if (t !== null) {
          const at = scaleColor(ray.color, Math.pow(0.985, t / 50));
          targetEnergy[target.id].r += at.r;
          targetEnergy[target.id].g += at.g;
          targetEnergy[target.id].b += at.b;
        }
      }
      for (const sensor of level.sensors || []) {
        const s = segmentFor(sensor);
        const hit = lineIntersection(ray.origin, ray.direction, s.a, s.b);
        if (hit && hit.t <= maxDistance && colorEnergy(ray.color) > (sensor.threshold || .08)) forbiddenHits[sensor.id] = true;
      }
      if (!nearest) continue;

      const item = nearest.collider.item;
      const point = nearest.hit.point;
      const nextOrigin = direction => V.add(point, V.mul(direction, EPSILON * 2));
      if (item.type === "wall") continue;
      if (item.type === "mirror") {
        const direction = reflect(ray.direction, nearest.collider.normal);
        queue.push({ ...ray, origin: nextOrigin(direction), direction, color: scaleColor(endColor, .92), bounce: ray.bounce + 1 });
      } else if (item.type === "filter") {
        const color = scaleColor(filterColor(endColor, item.channel), .9);
        queue.push({ ...ray, origin: nextOrigin(ray.direction), color, bounce: ray.bounce + 1 });
      } else if (item.type === "splitter") {
        const reflected = reflect(ray.direction, nearest.collider.normal);
        queue.push({ ...ray, origin: nextOrigin(ray.direction), color: scaleColor(endColor, .47), bounce: ray.bounce + 1 });
        queue.push({ ...ray, origin: nextOrigin(reflected), direction: reflected, color: scaleColor(endColor, .47), bounce: ray.bounce + 1 });
      } else if (item.type === "prism") {
        const channels = [["r", -.13], ["g", 0], ["b", .13]];
        for (const [channel, spread] of channels) {
          const baseAngle = V.angle(ray.direction) + spread + (item.angle || 0) * .35;
          const direction = V.fromAngle(baseAngle);
          const color = scaleColor(filterColor(endColor, channel), .86);
          queue.push({ ...ray, origin: nextOrigin(direction), direction, color, bounce: ray.bounce + 1 });
        }
      }
    }

    const targetStates = (level.targets || []).map(target => {
      const energy = targetEnergy[target.id];
      const required = target.required || ["r", "g", "b"];
      const threshold = target.threshold || .28;
      const correct = required.every(c => energy[c] >= threshold);
      const wrongChannels = ["r", "g", "b"].filter(c => !required.includes(c));
      const clean = wrongChannels.every(c => energy[c] < (target.wrongTolerance || .18));
      return { ...target, energy, lit: correct && clean };
    });
    const won = targetStates.length > 0 && targetStates.every(t => t.lit) && Object.keys(forbiddenHits).length === 0;
    return { segments, targetStates, forbiddenHits, won, processed };
  }

  const api = { EPSILON, MAX_BOUNCES, V, lineIntersection, reflect, segmentFor, propagate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LightEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
