// ── Uniform block
struct Uniforms {
  mvp         : mat4x4<f32>,
  model       : mat4x4<f32>,
  normalMat   : mat4x4<f32>,

  lightPos    : vec3<f32>,
  _p0         : f32,

  lightColor  : vec3<f32>,
  _p1         : f32,

  ambient     : f32,
  diffuse     : f32,
  specular    : f32,
  shininess   : f32,

  camPos      : vec3<f32>,
  model_id    : u32,

  objectColor : vec3<f32>,
  time        : f32,

  // Wireframe toggle uploaded from main.ts each frame.
  
  wireframe   : u32,
  _p2         : f32,
  _p3         : f32,
  _p4         : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

// ── Vertex shader I/O
struct VSIn {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
  @location(3) bary  : vec3<f32>, // TASK 11 receive the barycentric coordinates

};

struct VSOut {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) worldPos      : vec3<f32>,
  @location(1) worldNormal   : vec3<f32>,
  @location(2) uv            : vec2<f32>,
  @location(3) gouraudColor  : vec3<f32>,

  // Barycentric coordinate for this vertex.
  // Each vertex of a triangle gets one of: (1,0,0) (0,1,0) (0,0,1)
  @location(4) bary          : vec3<f32>,
};

// ── Flat shading
fn flatShading(fragWorldPos: vec3<f32>) -> vec3<f32> {
  let dx    = dpdx(fragWorldPos);
  let dy    = dpdy(fragWorldPos);
  let faceN = normalize(cross(dx, dy));

  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos   - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL    = max(dot(faceN, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, faceN);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── Gouraud shading (Per-Vertex)
fn gouraudLighting(N: vec3<f32>, vertWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - vertWorldPos);
  let V = normalize(u.camPos   - vertWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL    = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, N);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── Phong shading (Per-Fragment)
fn phongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos   - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL    = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, N);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── Blinn-Phong shading (Per-Fragment using Halfway Vector)
fn blinnPhongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos   - fragWorldPos);
  let H = normalize(L + V);

  let ambientC = u.ambient * u.lightColor;
  let NdotL    = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let NdotH = max(dot(N, H), 0.0);
    specularC = u.specular * pow(NdotH, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

@vertex
fn vs_main(
  input: VSIn,
  @builtin(vertex_index) vertIdx: u32   // TODO [TASK 11] – needed for bary
) -> VSOut {
  var out: VSOut;

  let worldPos4    = u.model     * vec4<f32>(input.position, 1.0);
  let worldNormal4 = u.normalMat * vec4<f32>(input.normal,   0.0);

  out.clipPos     = u.mvp * vec4<f32>(input.position, 1.0);
  out.worldPos    = worldPos4.xyz;
  out.worldNormal = normalize(worldNormal4.xyz);
  out.uv          = input.uv;
  out.bary        = input.bary;

  if u.model_id == 1u {
    out.gouraudColor = gouraudLighting(out.worldNormal, out.worldPos);
  } else {
    out.gouraudColor = vec3<f32>(0.0);
  }

  
  return out;
}

struct FSOut{
  @location(0) color : vec4<f32>,
  @location(1) normal  : vec4<f32>,
};

@fragment
fn fs_main(input: VSOut) -> FSOut {

  // TASK 6 - normals
  var out: FSOut;
  let N = normalize(input.worldNormal);
  out.normal = vec4<f32>((N + vec3<f32>(1.0))*0.5, 1.0);

  if u.model_id == 4u {
    let edgeWidth = 0.02;  // adjust for thicker/thinner lines
    let minBary   = min(input.bary.x, min(input.bary.y, input.bary.z));
    if minBary > edgeWidth {
      discard;             // interior fragment — hidden by depth buffer if behind geometry
    }
    out.color = vec4<f32>(1.0, 1.0, 1.0, 1.0); // edge color — white
    return out;
  }

  if u.model_id == 5u {
    out.color = out.normal; // ← show the normal buffer on screen
    return out;
  }

  // ── Normal shading path 
  var color: vec3<f32>;

  switch u.model_id {
    case 0u: { color = flatShading(input.worldPos); }
    case 1u: { color = input.gouraudColor; }
    case 2u: { color = phongLighting(N, input.worldPos); }
    default: { color = blinnPhongLighting(N, input.worldPos); }
  }
  out.color = vec4<f32>(color, 1.0); 
  return out;
}