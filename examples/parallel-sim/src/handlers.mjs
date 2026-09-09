/**
 * Worker-safe numeric handlers for parallel-sim.
 */

export function orbit(payload) {
  const pos = payload.components.Position;
  const vel = payload.components.Velocity;
  const work = payload.resources.SimConfig?.work ?? 200;
  const out = new Float32Array(vel.data.length);
  const n = pos.entities.length;
  for (let i = 0; i < n; i++) {
    const b = i * 3;
    const x = pos.data[b];
    const y = pos.data[b + 1];
    let burn = 0;
    for (let k = 0; k < work; k++) {
      burn += Math.sin(x * 3 + k * 0.01) * Math.cos(y * 2 + k * 0.01);
    }
    out[b] = vel.data[b] + -x * 0.12 * (1 / 60) + burn * 1e-16;
    out[b + 1] = vel.data[b + 1] + -y * 0.12 * (1 / 60);
    out[b + 2] = vel.data[b + 2];
  }
  return {
    writes: [
      { name: "Velocity", fields: vel.fields, entities: vel.entities, data: out },
    ],
  };
}

export function heatField(payload) {
  const pos = payload.components.Position;
  const heat = payload.components.Heat;
  const work = payload.resources.SimConfig?.work ?? 200;
  const out = new Float32Array(heat.data.length);
  for (let i = 0; i < heat.entities.length; i++) {
    const b = i * 3;
    const x = pos.data[b];
    const y = pos.data[b + 1];
    let burn = heat.data[i];
    for (let k = 0; k < work; k++) {
      burn += Math.sin((x + y) * 4 + k * 0.02) * 0.00001;
    }
    out[i] = burn * 0.995;
  }
  return {
    writes: [
      { name: "Heat", fields: heat.fields, entities: heat.entities, data: out },
    ],
  };
}

export function wobble(payload) {
  const pos = payload.components.Position;
  const wob = payload.components.Wobble;
  const work = payload.resources.SimConfig?.work ?? 200;
  const out = new Float32Array(wob.data.length);
  for (let i = 0; i < wob.entities.length; i++) {
    const b = i * 3;
    let v = wob.data[i];
    for (let k = 0; k < work; k++) {
      v += Math.cos(pos.data[b] * 5 + k * 0.03) * 0.00001;
    }
    out[i] = v * 0.99;
  }
  return {
    writes: [
      { name: "Wobble", fields: wob.fields, entities: wob.entities, data: out },
    ],
  };
}

export function integrate(payload) {
  const pos = payload.components.Position;
  const vel = payload.components.Velocity;
  const dt = payload.resources.SimConfig?.dt ?? 1 / 60;
  const out = new Float32Array(pos.data.length);
  const n = pos.entities.length;
  for (let i = 0; i < n; i++) {
    const b = i * 3;
    out[b] = pos.data[b] + vel.data[b] * dt;
    out[b + 1] = pos.data[b + 1] + vel.data[b + 1] * dt;
    out[b + 2] = pos.data[b + 2] + vel.data[b + 2] * dt;
    if (out[b] > 1.2 || out[b] < -1.2) vel.data[b] *= -1;
    if (out[b + 1] > 1.2 || out[b + 1] < -1.2) vel.data[b + 1] *= -1;
  }
  return {
    writes: [
      { name: "Position", fields: pos.fields, entities: pos.entities, data: out },
      {
        name: "Velocity",
        fields: vel.fields,
        entities: vel.entities,
        data: new Float32Array(vel.data),
      },
    ],
  };
}
