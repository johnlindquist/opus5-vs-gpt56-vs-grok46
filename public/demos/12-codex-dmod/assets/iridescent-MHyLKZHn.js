var e=`// Prism Foundry WebGPU-native thin-film authoring path.
// The restrained palette is driven by view angle and optical thickness, not RGB noise.
struct FilmUniforms { base: vec4f, thickness_nm: f32, strength: f32, roughness: f32, time: f32 }
@group(0) @binding(0) var<uniform> film: FilmUniforms;

fn thin_film(view_dot_normal: f32) -> vec3f {
  let optical = film.thickness_nm * (1.0 + (1.0 - view_dot_normal) * 0.72);
  let phase = optical * 0.021;
  let bands = vec3f(sin(phase), sin(phase + 2.094), sin(phase + 4.188)) * 0.5 + 0.5;
  let restrained = mix(film.base.rgb, bands, film.strength * (1.0 - film.roughness * 0.65));
  return mix(restrained, vec3f(dot(restrained, vec3f(0.299, 0.587, 0.114))), 0.18);
}
`;export{e as default};