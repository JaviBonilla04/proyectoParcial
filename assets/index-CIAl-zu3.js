(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`// ── Uniform block\r
struct Uniforms {\r
  mvp         : mat4x4<f32>,\r
  model       : mat4x4<f32>,\r
  normalMat   : mat4x4<f32>,\r
\r
  lightPos    : vec3<f32>,\r
  _p0         : f32,\r
\r
  lightColor  : vec3<f32>,\r
  _p1         : f32,\r
\r
  ambient     : f32,\r
  diffuse     : f32,\r
  specular    : f32,\r
  shininess   : f32,\r
\r
  camPos      : vec3<f32>,\r
  model_id    : u32,\r
\r
  objectColor : vec3<f32>,\r
  time        : f32,\r
\r
  // TODO [TASK 11] – Wireframe toggle uploaded from main.ts each frame.\r
  // 0 = normal shading,  1 = wireframe mode.\r
  // Lives at byte offset 272 in the uniform buffer (uData32[68]).\r
  wireframe   : u32,\r
  _p2         : f32,\r
  _p3         : f32,\r
  _p4         : f32,\r
};\r
\r
@group(0) @binding(0) var<uniform> u : Uniforms;\r
\r
// ── Vertex shader I/O\r
struct VSIn {\r
  @location(0) position : vec3<f32>,\r
  @location(1) normal   : vec3<f32>,\r
  @location(2) uv       : vec2<f32>,\r
  @location(3) bary  : vec3<f32>, // TASK 11 receive the barycentric coordinates\r
\r
};\r
\r
struct VSOut {\r
  @builtin(position) clipPos : vec4<f32>,\r
  @location(0) worldPos      : vec3<f32>,\r
  @location(1) worldNormal   : vec3<f32>,\r
  @location(2) uv            : vec2<f32>,\r
  @location(3) gouraudColor  : vec3<f32>,\r
\r
  // TODO [TASK 11] – Barycentric coordinate for this vertex.\r
  // Each vertex of a triangle gets one of: (1,0,0) (0,1,0) (0,0,1).\r
  // The rasterizer interpolates these across the triangle so every\r
  // fragment receives its own (α,β,γ) with α+β+γ = 1.\r
  // A fragment is near an edge when any one of the three components\r
  // is close to 0 — e.g. α≈0 means the fragment is near the v1-v2 edge.\r
  @location(4) bary          : vec3<f32>,\r
};\r
\r
// ── Flat shading\r
fn flatShading(fragWorldPos: vec3<f32>) -> vec3<f32> {\r
  let dx    = dpdx(fragWorldPos);\r
  let dy    = dpdy(fragWorldPos);\r
  let faceN = normalize(cross(dx, dy));\r
\r
  let L = normalize(u.lightPos - fragWorldPos);\r
  let V = normalize(u.camPos   - fragWorldPos);\r
\r
  let ambientC = u.ambient * u.lightColor;\r
  let NdotL    = max(dot(faceN, L), 0.0);\r
  let diffuseC = u.diffuse * NdotL * u.lightColor;\r
\r
  var specularC = vec3<f32>(0.0);\r
  if NdotL > 0.0 {\r
    let R = reflect(-L, faceN);\r
    let RdotV = max(dot(R, V), 0.0);\r
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;\r
  }\r
\r
  return (ambientC + diffuseC + specularC) * u.objectColor;\r
}\r
\r
// ── Gouraud shading (Per-Vertex)\r
fn gouraudLighting(N: vec3<f32>, vertWorldPos: vec3<f32>) -> vec3<f32> {\r
  let L = normalize(u.lightPos - vertWorldPos);\r
  let V = normalize(u.camPos   - vertWorldPos);\r
\r
  let ambientC = u.ambient * u.lightColor;\r
  let NdotL    = max(dot(N, L), 0.0);\r
  let diffuseC = u.diffuse * NdotL * u.lightColor;\r
\r
  var specularC = vec3<f32>(0.0);\r
  if NdotL > 0.0 {\r
    let R = reflect(-L, N);\r
    let RdotV = max(dot(R, V), 0.0);\r
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;\r
  }\r
\r
  return (ambientC + diffuseC + specularC) * u.objectColor;\r
}\r
\r
// ── Phong shading (Per-Fragment)\r
fn phongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {\r
  let L = normalize(u.lightPos - fragWorldPos);\r
  let V = normalize(u.camPos   - fragWorldPos);\r
\r
  let ambientC = u.ambient * u.lightColor;\r
  let NdotL    = max(dot(N, L), 0.0);\r
  let diffuseC = u.diffuse * NdotL * u.lightColor;\r
\r
  var specularC = vec3<f32>(0.0);\r
  if NdotL > 0.0 {\r
    let R = reflect(-L, N);\r
    let RdotV = max(dot(R, V), 0.0);\r
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;\r
  }\r
\r
  return (ambientC + diffuseC + specularC) * u.objectColor;\r
}\r
\r
// ── Blinn-Phong shading (Per-Fragment using Halfway Vector)\r
fn blinnPhongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {\r
  let L = normalize(u.lightPos - fragWorldPos);\r
  let V = normalize(u.camPos   - fragWorldPos);\r
  let H = normalize(L + V);\r
\r
  let ambientC = u.ambient * u.lightColor;\r
  let NdotL    = max(dot(N, L), 0.0);\r
  let diffuseC = u.diffuse * NdotL * u.lightColor;\r
\r
  var specularC = vec3<f32>(0.0);\r
  if NdotL > 0.0 {\r
    let NdotH = max(dot(N, H), 0.0);\r
    specularC = u.specular * pow(NdotH, u.shininess) * u.lightColor;\r
  }\r
\r
  return (ambientC + diffuseC + specularC) * u.objectColor;\r
}\r
\r
// TODO [TASK 11] – vs_main now receives vertex_index as a builtin so it can\r
// assign a unique barycentric coordinate to each corner of every triangle.\r
// vertex_index % 3 cycles through 0,1,2 for consecutive vertices:\r
//   vertex 0 → bary = (1,0,0)\r
//   vertex 1 → bary = (0,1,0)\r
//   vertex 2 → bary = (0,0,1)\r
// NOTE: this works perfectly for non-indexed draws (cube, sphere) where\r
// vertices are laid out sequentially. For indexed OBJ draws, vertex_index\r
// is the value from the index buffer (not the triangle-local position),\r
// so bary assignment is approximate — visually acceptable for most meshes.\r
@vertex\r
fn vs_main(\r
  input: VSIn,\r
  @builtin(vertex_index) vertIdx: u32   // TODO [TASK 11] – needed for bary\r
) -> VSOut {\r
  var out: VSOut;\r
\r
  let worldPos4    = u.model     * vec4<f32>(input.position, 1.0);\r
  let worldNormal4 = u.normalMat * vec4<f32>(input.normal,   0.0);\r
\r
  out.clipPos     = u.mvp * vec4<f32>(input.position, 1.0);\r
  out.worldPos    = worldPos4.xyz;\r
  out.worldNormal = normalize(worldNormal4.xyz);\r
  out.uv          = input.uv;\r
  out.bary        = input.bary;\r
\r
  if u.model_id == 1u {\r
    out.gouraudColor = gouraudLighting(out.worldNormal, out.worldPos);\r
  } else {\r
    out.gouraudColor = vec3<f32>(0.0);\r
  }\r
\r
  \r
  return out;\r
}\r
\r
struct FSOut{\r
  @location(0) color : vec4<f32>,\r
  @location(1) normal  : vec4<f32>,\r
};\r
\r
@fragment\r
fn fs_main(input: VSOut) -> FSOut {\r
\r
  // TASK 6 - normals\r
  var out: FSOut;\r
  let N = normalize(input.worldNormal);\r
  out.normal = vec4<f32>((N + vec3<f32>(1.0))*0.5, 1.0);\r
\r
  // TODO [TASK 11] – Wireframe mode: hidden surface removal is handled\r
  // automatically by the depth buffer (depthCompare: "less" in the pipeline).\r
  // Edge detection works by checking the minimum barycentric component:\r
  //   min(α,β,γ) is large (≈0.33) at the triangle center\r
  //   min(α,β,γ) approaches 0 near any edge\r
  // Fragments where min > edgeWidth are interior → discard them.\r
  // Fragments where min ≤ edgeWidth are on an edge → draw them in wireColor.\r
\r
  if u.model_id == 4u {\r
    let edgeWidth = 0.02;  // adjust for thicker/thinner lines\r
    let minBary   = min(input.bary.x, min(input.bary.y, input.bary.z));\r
    if minBary > edgeWidth {\r
      discard;             // interior fragment — hidden by depth buffer if behind geometry\r
    }\r
    out.color = vec4<f32>(1.0, 1.0, 1.0, 1.0); // edge color — white\r
    return out;\r
  }\r
\r
  if u.model_id == 5u {\r
    out.color = out.normal; // ← show the normal buffer on screen\r
    return out;\r
  }\r
\r
  // ── Normal shading path (unchanged) ─────────────────────────────────────\r
  var color: vec3<f32>;\r
\r
  switch u.model_id {\r
    case 0u: { color = flatShading(input.worldPos); }\r
    case 1u: { color = input.gouraudColor; }\r
    case 2u: { color = phongLighting(N, input.worldPos); }\r
    default: { color = blinnPhongLighting(N, input.worldPos); }\r
  }\r
  out.color = vec4<f32>(color, 1.0); \r
  return out;\r
}`,t={add(e,t){return[e[0]+t[0],e[1]+t[1],e[2]+t[2]]},sub(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]},scale(e,t){return[e[0]*t,e[1]*t,e[2]*t]},dot(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]},cross(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]},normalize(e){let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]}},n={identity(){return[0,0,0,1]},multiply(e,t){let[n,r,i,a]=e,[o,s,c,l]=t;return[a*o+n*l+r*c-i*s,a*s-n*c+r*l+i*o,a*c+n*s-r*o+i*l,a*l-n*o-r*s-i*c]},normalize(e){let t=Math.hypot(e[0],e[1],e[2],e[3])||1;return[e[0]/t,e[1]/t,e[2]/t,e[3]/t]},toMat4(e){let[t,n,r,i]=e,a=new Float32Array(16);return a[0]=1-2*n*n-2*r*r,a[1]=2*t*n+2*r*i,a[2]=2*t*r-2*n*i,a[3]=0,a[4]=2*t*n-2*r*i,a[5]=1-2*t*t-2*r*r,a[6]=2*n*r+2*t*i,a[7]=0,a[8]=2*t*r+2*n*i,a[9]=2*n*r-2*t*i,a[10]=1-2*t*t-2*n*n,a[11]=0,a[12]=0,a[13]=0,a[14]=0,a[15]=1,a},mapSphere(e,t){let n=e*e+t*t;if(n<=1)return[e,t,Math.sqrt(1-n)];{let r=Math.sqrt(n);return[e/r,t/r,0]}},computeRotation(e,r,i,a){let o=n.mapSphere(e,r),s=n.mapSphere(i,a),c=t.cross(o,s),l=t.dot(o,s);Math.sqrt(Math.max(0,1-l*l))*.5;let u=Math.acos(Math.min(1,l)),d=Math.sin(u/2),f=Math.cos(u/2);return n.normalize([c[0]*d,c[1]*d,c[2]*d,f])}},r={identity(){let e=new Float32Array(16);return e[0]=1,e[5]=1,e[10]=1,e[15]=1,e},multiply(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++)n[r*4+i]=e[0+i]*t[r*4+0]+e[4+i]*t[r*4+1]+e[8+i]*t[r*4+2]+e[12+i]*t[r*4+3];return n},transpose(e){let t=new Float32Array(16);for(let n=0;n<4;n++)for(let r=0;r<4;r++)t[r*4+n]=e[n*4+r];return t},invert(e){let t=new Float32Array(16),n=e[0],i=e[1],a=e[2],o=e[3],s=e[4],c=e[5],l=e[6],u=e[7],d=e[8],f=e[9],p=e[10],m=e[11],h=e[12],g=e[13],_=e[14],v=e[15],y=n*c-i*s,b=n*l-a*s,x=n*u-o*s,S=i*l-a*c,C=i*u-o*c,w=a*u-o*l,T=d*g-f*h,E=d*_-p*h,D=d*v-m*h,O=f*_-p*g,k=f*v-m*g,A=p*v-m*_,j=y*A-b*k+x*O+S*D-C*E+w*T;return j?(j=1/j,t[0]=(c*A-l*k+u*O)*j,t[1]=(l*D-s*A-u*E)*j,t[2]=(s*k-c*D+u*T)*j,t[3]=(c*E-s*O-l*T)*j,t[4]=(a*k-i*A-o*O)*j,t[5]=(n*A-a*D+o*E)*j,t[6]=(i*D-n*k-o*T)*j,t[7]=(n*O-i*E+a*T)*j,t[8]=(g*w-_*C+v*S)*j,t[9]=(_*x-h*w-v*b)*j,t[10]=(h*C-g*x+v*y)*j,t[11]=(g*b-h*S-_*y)*j,t[12]=(p*C-f*w-m*S)*j,t[13]=(d*w-p*x+m*b)*j,t[14]=(f*x-d*C-m*y)*j,t[15]=(d*S-f*b+p*y)*j,t):r.identity()},normalMatrix(e){return r.transpose(r.invert(e))},translation(e,t,n){let i=r.identity();return i[12]=e,i[13]=t,i[14]=n,i},scaling(e,t,n){let i=r.identity();return i[0]=e,i[5]=t,i[10]=n,i},rotationX(e){let t=Math.cos(e),n=Math.sin(e),i=r.identity();return i[5]=t,i[6]=n,i[9]=-n,i[10]=t,i},rotationY(e){let t=Math.cos(e),n=Math.sin(e),i=r.identity();return i[0]=t,i[2]=-n,i[8]=n,i[10]=t,i},rotationZ(e){let t=Math.cos(e),n=Math.sin(e),i=r.identity();return i[0]=t,i[1]=n,i[4]=-n,i[5]=t,i},perspective(e,t,n,r){let i=1/Math.tan(e/2),a=new Float32Array(16);return a[0]=i/t,a[5]=i,a[10]=r/(n-r),a[11]=-1,a[14]=r*n/(n-r),a},lookAt(e,n,r){let i=t.normalize(t.sub(e,n)),a=t.normalize(t.cross(r,i)),o=t.cross(i,a),s=new Float32Array(16);return s[0]=a[0],s[4]=a[1],s[8]=a[2],s[12]=-t.dot(a,e),s[1]=o[0],s[5]=o[1],s[9]=o[2],s[13]=-t.dot(o,e),s[2]=i[0],s[6]=i[1],s[10]=i[2],s[14]=-t.dot(i,e),s[3]=0,s[7]=0,s[11]=0,s[15]=1,s}},i=class{position=[0,.8,6];yaw=-Math.PI/2;pitch=0;moveSpeed=3.5;turnSpeed=1.9;clampPitch(){let e=Math.PI/2-.01;this.pitch>e&&(this.pitch=e),this.pitch<-e&&(this.pitch=-e)}getForward(){let e=Math.cos(this.pitch);return t.normalize([Math.cos(this.yaw)*e,Math.sin(this.pitch),Math.sin(this.yaw)*e])}getViewMatrix(){let e=this.getForward(),n=t.add(this.position,e);return r.lookAt(this.position,n,[0,1,0])}update(e,n){e.has(`ArrowLeft`)&&(this.yaw-=this.turnSpeed*n),e.has(`ArrowRight`)&&(this.yaw+=this.turnSpeed*n),e.has(`ArrowUp`)&&(this.pitch+=this.turnSpeed*n),e.has(`ArrowDown`)&&(this.pitch-=this.turnSpeed*n),this.clampPitch();let r=this.getForward(),i=t.normalize(t.cross(r,[0,1,0])),a=[0,1,0],o=this.moveSpeed*n;e.has(`w`)&&(this.position=t.add(this.position,t.scale(r,o))),e.has(`s`)&&(this.position=t.add(this.position,t.scale(r,-o))),e.has(`a`)&&(this.position=t.add(this.position,t.scale(i,-o))),e.has(`d`)&&(this.position=t.add(this.position,t.scale(i,o))),e.has(`q`)&&(this.position=t.add(this.position,t.scale(a,-o))),e.has(`e`)&&(this.position=t.add(this.position,t.scale(a,o)))}},a={modelId:0,ambient:.12,diffuse:.75,specular:.6,shininess:32,lightX:3,lightY:4,lightZ:3,autoRotLight:!0,objectColor:`#4a9eff`,lightColor:`#ffffff`};function o(e){let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]}var s={0:`Flat: face normal derived from dpdx/dpdy — one colour per triangle, hard faceted edges.`,1:`Gouraud: lighting computed per vertex, interpolated across the face.`,2:`Phong: smooth normals interpolated per pixel, full lighting in fs_main.`,3:`Blinn-Phong: like Phong but uses half-vector H=normalize(L+V) for specular.`,4:`Wireframe: barycentric edge detection with hidden surface removal via back-face culling.`,5:`Normal Buffer: world-space normals encoded as RGB — R=X G=Y B=Z remapped [-1,1]→[0,1].`};function c(e,t){document.getElementById(`lightX`).value=e.toFixed(1),document.getElementById(`lightX-val`).textContent=e.toFixed(1),document.getElementById(`lightZ`).value=t.toFixed(1),document.getElementById(`lightZ-val`).textContent=t.toFixed(1)}function l(e,t,n,r,i,a){return`
  <div class="slider-row">
    <span class="slider-label">${t}</span>
    <input type="range" id="${e}" min="${n}" max="${r}" step="${i}" value="${a}">
    <span class="slider-val" id="${e}-val">${a}</span>
  </div>`}function u(e,t){let n=document.createElement(`div`);n.id=`gui`,n.innerHTML=`
<div class="gui-panel">
  <div class="gui-title">Graphics Pipeline</div>

  <div class="gui-section">
    <div class="gui-label">Shading Model</div>
    <div class="model-btns">
      <button class="model-btn active" data-id="0">Flat</button>
      <button class="model-btn" data-id="1">Gouraud</button>
      <button class="model-btn" data-id="2">Phong</button>
      <button class="model-btn" data-id="3">Blinn-Phong</button>
      <button class="model-btn" data-id="4">Wireframe</button>
      <button class="model-btn" data-id="5">Normals</button>
    </div>
    <div class="model-desc" id="model-desc"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Geometry</div>
    <div class="model-btns">
      <button class="shape-btn active" data-shape="cube">Cube</button>
      <button class="shape-btn" data-shape="sphere">Sphere</button>
      <button class="shape-btn" data-shape="teapot">Teapot</button>
      <button class="shape-btn" data-shape="beacon">Beacon</button>
    </div>
    <div class="model-desc" id="shape-desc">Cube shape</div>

    <div class="gui-label" style="margin-top:8px">Custom OBJ</div>
    <div style="display:flex; align-items:center; gap:6px; margin-top:4px">
      <label class="file-btn" for="obj-file-input"
             style="cursor:pointer; padding:3px 8px; background:#444; border-radius:4px; font-size:12px">
        Browse…
      </label>
      <span id="obj-file-name" style="font-size:11px; color:#aaa">No file selected</span>
    </div>
    <input type="file" id="obj-file-input" accept=".obj" style="display:none">
  </div>

  <div class="gui-section">
    <div class="gui-label">Material</div>
    ${l(`ambient`,`Ambient (Ka)`,0,1,.01,a.ambient)}
    ${l(`diffuse`,`Diffuse (Kd)`,0,1,.01,a.diffuse)}
    ${l(`specular`,`Specular (Ks)`,0,1,.01,a.specular)}
    ${l(`shininess`,`Shininess (n)`,1,256,1,a.shininess)}
  </div>

  <div class="gui-section">
    <div class="gui-label">Light</div>
    ${l(`lightX`,`X`,-8,8,.1,a.lightX)}
    ${l(`lightY`,`Y`,-8,8,.1,a.lightY)}
    ${l(`lightZ`,`Z`,-8,8,.1,a.lightZ)}
    <label class="checkbox-row">
      <input type="checkbox" id="autoRotLight" checked> Auto-rotate light
    </label>
  </div>

  <div class="gui-section">
    <div class="gui-label">Colors</div>
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${a.objectColor}"></div>
    <div class="color-row"><span>Light</span><input type="color" id="lightColor"   value="${a.lightColor}"></div>
  </div>

  <div class="gui-hint">WASD/QE move · Arrows look · Drag to rotate</div>
</div>`,document.body.appendChild(n);function r(){document.getElementById(`model-desc`).textContent=s[a.modelId]??``}r(),document.querySelectorAll(`.model-btn`).forEach(e=>{e.addEventListener(`click`,()=>{a.modelId=Number(e.dataset.id),document.querySelectorAll(`.model-btn`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),r()})}),document.querySelectorAll(`.shape-btn`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.shape;document.querySelectorAll(`.shape-btn`).forEach(e=>e.classList.remove(`active`)),t.classList.add(`active`),document.getElementById(`shape-desc`).textContent=n===`cube`?`Unit cube with axis-aligned face normals.`:n===`sphere`?`UV sphere with analytic normals.`:n===`teapot`?`Utah Teapot — bounding box centered at origin.`:`Beacon — bounding sphere centered at origin.`,document.getElementById(`obj-file-name`).textContent=`No file selected`,e(n)})});let i=document.getElementById(`obj-file-input`);i.addEventListener(`change`,()=>{let e=i.files?.[0];e&&(document.getElementById(`obj-file-name`).textContent=e.name,document.querySelectorAll(`.shape-btn`).forEach(e=>e.classList.remove(`active`)),document.getElementById(`shape-desc`).textContent=`Custom: ${e.name}`,t(e))}),[`ambient`,`diffuse`,`specular`,`shininess`,`lightX`,`lightY`,`lightZ`].forEach(e=>{let t=document.getElementById(e),n=document.getElementById(`${e}-val`);t.addEventListener(`input`,()=>{a[e]=parseFloat(t.value),n.textContent=t.value})}),document.getElementById(`autoRotLight`).addEventListener(`change`,e=>{a.autoRotLight=e.target.checked}),document.getElementById(`objectColor`).addEventListener(`input`,e=>{a.objectColor=e.target.value}),document.getElementById(`lightColor`).addEventListener(`input`,e=>{a.lightColor=e.target.value})}function d(e,t,n){return`${e}/${t}/${n}`}async function f(e){let t=await fetch(e).then(t=>{if(!t.ok)throw Error(`Failed to fetch OBJ: ${e} (${t.status})`);return t.text()}),n=[],r=[],i=[],a=[],o=[],s=[],c=[],l=new Map;function u(e,t,c){let u=d(e,t,c);if(l.has(u))return l.get(u);let f=a.length/3;return l.set(u,f),a.push(n[e*3],n[e*3+1],n[e*3+2]),t>=0&&r.length>0?o.push(r[t*2],r[t*2+1]):o.push(0,0),c>=0&&i.length>0?s.push(i[c*3],i[c*3+1],i[c*3+2]):s.push(0,0,0),f}for(let e of t.split(`
`)){let t=e.trim();if(!t||t.startsWith(`#`))continue;let a=t.split(/\s+/),o=a[0];if(o===`v`)n.push(parseFloat(a[1]),parseFloat(a[2]),parseFloat(a[3]));else if(o===`vt`)r.push(parseFloat(a[1]),parseFloat(a[2]));else if(o===`vn`)i.push(parseFloat(a[1]),parseFloat(a[2]),parseFloat(a[3]));else if(o===`f`){let e=[];for(let t=1;t<a.length;t++){let n=a[t].split(`/`),r=parseInt(n[0])-1,i=n[1]&&n[1]!==``?parseInt(n[1])-1:-1,o=n[2]&&n[2]!==``?parseInt(n[2])-1:-1;e.push(u(r,i,o))}for(let t=1;t+1<e.length;t++)c.push(e[0],e[t],e[t+1])}}return{positions:new Float32Array(a),normals:new Float32Array(s),uvs:new Float32Array(o),indices:new Uint32Array(c)}}function p(e){let{positions:t,indices:n}=e,r=new Float32Array(t.length);for(let e=0;e<n.length;e+=3){let i=n[e],a=n[e+1],o=n[e+2],s=t[i*3],c=t[i*3+1],l=t[i*3+2],u=t[a*3],d=t[a*3+1],f=t[a*3+2],p=t[o*3],m=t[o*3+1],h=t[o*3+2],g=u-s,_=d-c,v=f-l,y=p-s,b=m-c,x=h-l,S=_*x-v*b,C=v*y-g*x,w=g*b-_*y;r[i*3]+=S,r[i*3+1]+=C,r[i*3+2]+=w,r[a*3]+=S,r[a*3+1]+=C,r[a*3+2]+=w,r[o*3]+=S,r[o*3+1]+=C,r[o*3+2]+=w}for(let e=0;e<r.length;e+=3){let t=r[e],n=r[e+1],i=r[e+2],a=Math.sqrt(t*t+n*n+i*i);a>1e-5&&(r[e]/=a,r[e+1]/=a,r[e+2]/=a)}e.normals=r}if(!navigator.gpu)throw Error(`WebGPU not supported`);var m=document.querySelector(`#gfx-main`);if(!m)throw Error(`Canvas #gfx-main not found`);var h=await navigator.gpu.requestAdapter();if(!h)throw Error(`No GPU adapter found`);var g=await h.requestDevice(),_=m.getContext(`webgpu`),v=navigator.gpu.getPreferredCanvasFormat(),y=null,b=null;function x(){b?.destroy(),b=g.createTexture({size:[m.width,m.height],format:`rgba8unorm`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING})}function S(){m.width=Math.max(1,Math.floor(window.innerWidth*devicePixelRatio)),m.height=Math.max(1,Math.floor(window.innerHeight*devicePixelRatio)),_.configure({device:g,format:v,alphaMode:`premultiplied`}),y?.destroy(),y=g.createTexture({size:[m.width,m.height],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),x()}S(),window.addEventListener(`resize`,S);var C=[[1,0,0],[0,1,0],[0,0,1]];function w(){let e=[{n:[0,0,1],verts:[[-1,-1,1,0,1],[1,-1,1,1,1],[1,1,1,1,0],[-1,-1,1,0,1],[1,1,1,1,0],[-1,1,1,0,0]]},{n:[0,0,-1],verts:[[1,-1,-1,0,1],[-1,-1,-1,1,1],[-1,1,-1,1,0],[1,-1,-1,0,1],[-1,1,-1,1,0],[1,1,-1,0,0]]},{n:[-1,0,0],verts:[[-1,-1,-1,0,1],[-1,-1,1,1,1],[-1,1,1,1,0],[-1,-1,-1,0,1],[-1,1,1,1,0],[-1,1,-1,0,0]]},{n:[1,0,0],verts:[[1,-1,1,0,1],[1,-1,-1,1,1],[1,1,-1,1,0],[1,-1,1,0,1],[1,1,-1,1,0],[1,1,1,0,0]]},{n:[0,1,0],verts:[[-1,1,1,0,1],[1,1,1,1,1],[1,1,-1,1,0],[-1,1,1,0,1],[1,1,-1,1,0],[-1,1,-1,0,0]]},{n:[0,-1,0],verts:[[-1,-1,-1,0,1],[1,-1,-1,1,1],[1,-1,1,1,0],[-1,-1,-1,0,1],[1,-1,1,1,0],[-1,-1,1,0,0]]}],t=[],n=0;for(let r of e)for(let e of r.verts)t.push(e[0],e[1],e[2],...r.n,e[3],e[4],...C[n++%3]);return new Float32Array(t)}function T(e,t,n,r,i,a){let o=Math.cos(t)*Math.sin(e),s=Math.cos(e),c=Math.sin(t)*Math.sin(e);return[o,s,c,o,s,c,r/i,n/a]}function E(e,t){let n=[],r=0;for(let i=0;i<e;i++){let a=Math.PI*(i/e),o=Math.PI*((i+1)/e);for(let s=0;s<t;s++){let c=2*Math.PI*(s/t),l=2*Math.PI*((s+1)/t),u=T(a,c,i,s,t,e),d=T(a,l,i,s+1,t,e),f=T(o,l,i+1,s+1,t,e),p=T(o,c,i+1,s,t,e);n.push(...u,...C[r++%3]),n.push(...d,...C[r++%3]),n.push(...f,...C[r++%3]),n.push(...u,...C[r++%3]),n.push(...f,...C[r++%3]),n.push(...p,...C[r++%3])}}return new Float32Array(n)}function D(e){let t=e===`cube`?w():E(64,64),n=g.createBuffer({size:t.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return g.queue.writeBuffer(n,0,t),{buf:n,count:t.length/11}}function O(e){let t=e.indices.length/3,n=new Float32Array(t*3*11),r=0;for(let i=0;i<t;i++)for(let t=0;t<3;t++){let a=e.indices[i*3+t];n[r++]=e.positions[a*3],n[r++]=e.positions[a*3+1],n[r++]=e.positions[a*3+2],n[r++]=e.normals[a*3],n[r++]=e.normals[a*3+1],n[r++]=e.normals[a*3+2],n[r++]=e.uvs[a*2],n[r++]=e.uvs[a*2+1],n[r++]=C[t][0],n[r++]=C[t][1],n[r++]=C[t][2]}let i=g.createBuffer({size:n.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return g.queue.writeBuffer(i,0,n),{buf:i,count:t*3}}function k(e){let t=1/0,n=1/0,r=1/0,i=-1/0,a=-1/0,o=-1/0;for(let s=0;s<e.positions.length;s+=3)t=Math.min(t,e.positions[s]),n=Math.min(n,e.positions[s+1]),r=Math.min(r,e.positions[s+2]),i=Math.max(i,e.positions[s]),a=Math.max(a,e.positions[s+1]),o=Math.max(o,e.positions[s+2]);let s=(t+i)/2,c=(n+a)/2,l=(r+o)/2,u=i-t,d=a-n,f=o-r;return{cx:s,cy:c,cz:l,scale:1/(Math.sqrt(u*u+d*d+f*f)/2)}}var A=r.identity(),{buf:j,count:M}=D(`cube`),N=288,P=g.createBuffer({size:N,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),F=new ArrayBuffer(N),I=new Float32Array(F),L=new Uint32Array(F),R={arrayStride:44,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x2`},{shaderLocation:3,offset:32,format:`float32x3`}]},z=[{format:v},{format:`rgba8unorm`}],B=g.createShaderModule({label:`Main Shader`,code:e}),V=g.createRenderPipeline({label:`Main Pipeline`,layout:`auto`,vertex:{module:B,entryPoint:`vs_main`,buffers:[R]},fragment:{module:B,entryPoint:`fs_main`,targets:z},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ee=g.createBindGroup({layout:V.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:P}}]}),H=g.createRenderPipeline({label:`Wireframe Pipeline`,layout:`auto`,vertex:{module:B,entryPoint:`vs_main`,buffers:[R]},fragment:{module:B,entryPoint:`fs_main`,targets:z},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),te=g.createBindGroup({layout:H.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:P}}]});async function U(e,t,n){let r=await f(e);p(r),j.destroy(),{buf:j,count:M}=O(r),A=t(r),W.position=[0,0,n]}u(async e=>{if(e===`cube`||e===`sphere`){j.destroy(),{buf:j,count:M}=D(e),A=r.identity(),W.position=[0,0,5];return}if(e===`teapot`){await U(`/obj_models/teapot.obj`,()=>{let e=6.434,t=3.15,n=1/(Math.sqrt(e*e+t*t+16)/2);return r.multiply(r.scaling(n,n,n),r.translation(-.217,-1.575,-0))},2.5);return}e===`beacon`&&await U(`/obj_models/KAUST_Beacon.obj`,()=>{let e=1/125;return r.multiply(r.scaling(e,e,e),r.translation(-125,-125,-125))},2.5)},async e=>{let t=URL.createObjectURL(e);await U(t,e=>{let{cx:t,cy:n,cz:i,scale:a}=k(e);return r.multiply(r.scaling(a,a,a),r.translation(-t,-n,-i))},2.5),URL.revokeObjectURL(t)});var W=new i;W.position=[0,0,5];var G=new Set;window.addEventListener(`keydown`,e=>G.add(e.key)),window.addEventListener(`keyup`,e=>G.delete(e.key));var K=n.identity(),q=n.identity(),J=0,Y=0,X=!1;function Z(e,t){return[e/m.clientWidth*2-1,-(t/m.clientHeight*2-1)]}m.addEventListener(`mousedown`,e=>{X=!0,[J,Y]=Z(e.clientX,e.clientY),q=n.identity()}),m.addEventListener(`mousemove`,e=>{if(!X)return;let[t,r]=Z(e.clientX,e.clientY);q=n.computeRotation(t,r,J,Y)}),m.addEventListener(`mouseup`,()=>{K=n.multiply(q,K),q=n.identity(),X=!1}),m.addEventListener(`mouseleave`,()=>{X&&=(K=n.multiply(q,K),q=n.identity(),!1)});var Q=performance.now(),ne=performance.now();function $(e){let t=Math.min(.033,(e-Q)/1e3);Q=e;let i=(e-ne)/1e3;W.update(G,t);let s=m.width/m.height,l=r.perspective(60*Math.PI/180,s,.1,100),u=W.getViewMatrix(),d=n.toMat4(n.multiply(q,K)),f=r.multiply(d,A),p=r.normalMatrix(f),h=r.multiply(r.multiply(l,u),f),v=a.lightX,x=a.lightY,S=a.lightZ;a.autoRotLight&&(v=Math.cos(i*.8)*4.5,S=Math.sin(i*.8)*4.5,c(v,S));let[C,w,T]=o(a.objectColor),[E,D,O]=o(a.lightColor);I.set(h,0),I.set(f,16),I.set(p,32),I[48]=v,I[49]=x,I[50]=S,I[51]=0,I[52]=E,I[53]=D,I[54]=O,I[55]=0,I[56]=a.ambient,I[57]=a.diffuse,I[58]=a.specular,I[59]=a.shininess,I[60]=W.position[0],I[61]=W.position[1],I[62]=W.position[2],L[63]=a.modelId,I[64]=C,I[65]=w,I[66]=T,I[67]=i,g.queue.writeBuffer(P,0,F);let k=g.createCommandEncoder(),N=a.modelId===4,R=k.beginRenderPass({colorAttachments:[{view:_.getCurrentTexture().createView(),clearValue:{r:.08,g:.08,b:.12,a:1},loadOp:`clear`,storeOp:`store`},{view:b.createView(),clearValue:{r:.5,g:.5,b:1,a:1},loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:y.createView(),depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});R.setPipeline(N?H:V),R.setBindGroup(0,N?te:ee),R.setVertexBuffer(0,j),R.draw(M),R.end(),g.queue.submit([k.finish()]),requestAnimationFrame($)}requestAnimationFrame($);