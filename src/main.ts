/// <reference types="@webgpu/types" />

import "./style.css";
import shaderCode from "./shader.wgsl?raw";
import { Camera } from "./camera";
import { mat4, quat, type Quat } from "./math";
import type { Vec3 } from "./math";
import { gui, hexToRgb, initGUI, updateLightDisplay } from "./gui";
import { loadOBJ, computeNormals, type IndexedMesh } from "./OBJLoader";

// ── WebGPU init ───────────────────────────────────────────────────────────────
if (!navigator.gpu) throw new Error("WebGPU not supported");

const canvas = document.querySelector("#gfx-main") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gfx-main not found");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No GPU adapter found");

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu")!;
const format  = navigator.gpu.getPreferredCanvasFormat();

// ── Depth & normal textures ───────────────────────────────────────────────────
let depthTexture:  GPUTexture | null = null;
let normalTexture: GPUTexture | null = null;

function createNormalTexture() {
  normalTexture?.destroy();
  normalTexture = device.createTexture({
    size:   [canvas.width, canvas.height],
    format: "rgba8unorm",
    usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
}

function resize() {
  canvas.width  = Math.max(1, Math.floor(window.innerWidth  * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * devicePixelRatio));
  context.configure({ device, format, alphaMode: "premultiplied" });
  depthTexture?.destroy();
  depthTexture = device.createTexture({
    size:  [canvas.width, canvas.height],
    format: "depth24plus",
    usage:  GPUTextureUsage.RENDER_ATTACHMENT,
  });
  createNormalTexture();
}
resize();
window.addEventListener("resize", resize);

// ── Vertex format: [x,y,z | nx,ny,nz | u,v | bx,by,bz] ──────────────────────
//    stride = 11 floats = 44 bytes
//    bary = barycentric coordinate for wireframe edge detection (Task 11)

const BARY: [number,number,number][] = [[1,0,0],[0,1,0],[0,0,1]];

function generateCube(): Float32Array {
  const faces: Array<{ n: Vec3; verts: number[][] }> = [
    { n: [ 0, 0, 1], verts: [[-1,-1,1,0,1],[1,-1,1,1,1],[1,1,1,1,0],[-1,-1,1,0,1],[1,1,1,1,0],[-1,1,1,0,0]] },
    { n: [ 0, 0,-1], verts: [[ 1,-1,-1,0,1],[-1,-1,-1,1,1],[-1,1,-1,1,0],[1,-1,-1,0,1],[-1,1,-1,1,0],[1,1,-1,0,0]] },
    { n: [-1, 0, 0], verts: [[-1,-1,-1,0,1],[-1,-1,1,1,1],[-1,1,1,1,0],[-1,-1,-1,0,1],[-1,1,1,1,0],[-1,1,-1,0,0]] },
    { n: [ 1, 0, 0], verts: [[ 1,-1,1,0,1],[1,-1,-1,1,1],[1,1,-1,1,0],[1,-1,1,0,1],[1,1,-1,1,0],[1,1,1,0,0]] },
    { n: [ 0, 1, 0], verts: [[-1,1,1,0,1],[1,1,1,1,1],[1,1,-1,1,0],[-1,1,1,0,1],[1,1,-1,1,0],[-1,1,-1,0,0]] },
    { n: [ 0,-1, 0], verts: [[-1,-1,-1,0,1],[1,-1,-1,1,1],[1,-1,1,1,0],[-1,-1,-1,0,1],[1,-1,1,1,0],[-1,-1,1,0,0]] },
  ];
  const data: number[] = [];
  let cnt = 0;
  for (const face of faces)
    for (const v of face.verts) {
      data.push(v[0], v[1], v[2], ...face.n, v[3], v[4], ...BARY[cnt++ % 3]);
    }
  return new Float32Array(data);
}

function sphereVertex(phi: number, theta: number, i: number, j: number, sl: number, st: number) {
  const x = Math.cos(theta)*Math.sin(phi);
  const y = Math.cos(phi);
  const z = Math.sin(theta)*Math.sin(phi);
  return [x, y, z, x, y, z, j/sl, i/st]; // normal = position for unit sphere
}

function generateSphere(stacks: number, slices: number): Float32Array {
  const data: number[] = [];
  let cnt = 0;
  for (let i = 0; i < stacks; i++) {
    const phi1 = Math.PI * (i / stacks);
    const phi2 = Math.PI * ((i+1) / stacks);
    for (let j = 0; j < slices; j++) {
      const th1 = 2*Math.PI * (j / slices);
      const th2 = 2*Math.PI * ((j+1) / slices);
      const c1 = sphereVertex(phi1, th1, i,   j,   slices, stacks);
      const c2 = sphereVertex(phi1, th2, i,   j+1, slices, stacks);
      const c3 = sphereVertex(phi2, th2, i+1, j+1, slices, stacks);
      const c4 = sphereVertex(phi2, th1, i+1, j,   slices, stacks);
      data.push(...c1, ...BARY[cnt++ % 3]);
      data.push(...c2, ...BARY[cnt++ % 3]);
      data.push(...c3, ...BARY[cnt++ % 3]);
      data.push(...c1, ...BARY[cnt++ % 3]);
      data.push(...c3, ...BARY[cnt++ % 3]);
      data.push(...c4, ...BARY[cnt++ % 3]);
    }
  }
  return new Float32Array(data);
}

// ── Mesh helpers ──────────────────────────────────────────────────────────────

function buildVertexBuffer(shape: "cube" | "sphere"): { buf: GPUBuffer; count: number } {
  const data = shape === "cube" ? generateCube() : generateSphere(64, 64);
  const buf = device.createBuffer({
    size:  data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return { buf, count: data.length / 11 };
}

// Expands an IndexedMesh into a flat non-indexed vertex buffer with bary coords.
// Each triangle gets 3 dedicated vertices so bary = (1,0,0)(0,1,0)(0,0,1) is unambiguous.
function buildOBJBuffers(mesh: IndexedMesh): { buf: GPUBuffer; count: number } {
  const triCount  = mesh.indices.length / 3;
  const flat      = new Float32Array(triCount * 3 * 11);
  let   offset    = 0;

  for (let t = 0; t < triCount; t++) {
    for (let corner = 0; corner < 3; corner++) {
      const idx = mesh.indices[t * 3 + corner];
      flat[offset++] = mesh.positions[idx*3];
      flat[offset++] = mesh.positions[idx*3+1];
      flat[offset++] = mesh.positions[idx*3+2];
      flat[offset++] = mesh.normals[idx*3];
      flat[offset++] = mesh.normals[idx*3+1];
      flat[offset++] = mesh.normals[idx*3+2];
      flat[offset++] = mesh.uvs[idx*2];
      flat[offset++] = mesh.uvs[idx*2+1];
      flat[offset++] = BARY[corner][0];
      flat[offset++] = BARY[corner][1];
      flat[offset++] = BARY[corner][2];
    }
  }

  const buf = device.createBuffer({
    size:  flat.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, flat);
  return { buf, count: triCount * 3 };
}

// Computes center and uniform scale from the mesh's axis-aligned bounding box.
function computeMeshBounds(mesh: IndexedMesh): { cx: number; cy: number; cz: number; scale: number } {
  let minX=Infinity, minY=Infinity, minZ=Infinity;
  let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    minX = Math.min(minX, mesh.positions[i]);
    minY = Math.min(minY, mesh.positions[i+1]);
    minZ = Math.min(minZ, mesh.positions[i+2]);
    maxX = Math.max(maxX, mesh.positions[i]);
    maxY = Math.max(maxY, mesh.positions[i+1]);
    maxZ = Math.max(maxZ, mesh.positions[i+2]);
  }
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2, cz = (minZ+maxZ)/2;
  const dx = maxX-minX,     dy = maxY-minY,     dz = maxZ-minZ;
  return { cx, cy, cz, scale: 1 / (Math.sqrt(dx*dx+dy*dy+dz*dz)/2) };
}

// ── Active shape + GPU buffers ────────────────────────────────────────────────
let activeShape: "cube" | "sphere" | "teapot" | "beacon" | "custom" = "cube";
let meshModelMatrix: Float32Array = mat4.identity();
let { buf: vertexBuffer, count: vertexCount } = buildVertexBuffer("cube");

// ── Uniform buffer ────────────────────────────────────────────────────────────
// Layout (byte offsets):
//   0   mvp        mat4  64 B     64  model      mat4  64 B
//   128 normalMat  mat4  64 B     192 lightPos   vec3+pad 16 B
//   208 lightColor vec3+pad 16 B  224 Ka/Kd/Ks/n  16 B
//   240 camPos+modelId  16 B      256 objectColor+time  16 B
//   272 (unused padding to 288)
const UNIFORM_SIZE = 288;

const uniformBuffer = device.createBuffer({
  size:  UNIFORM_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uArrayBuf = new ArrayBuffer(UNIFORM_SIZE);
const uData     = new Float32Array(uArrayBuf);
const uData32   = new Uint32Array(uArrayBuf);

// ── Shared pipeline vertex layout ─────────────────────────────────────────────
const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 11 * 4,
  attributes: [
    { shaderLocation: 0, offset: 0,      format: "float32x3" }, // position
    { shaderLocation: 1, offset: 3 * 4,  format: "float32x3" }, // normal
    { shaderLocation: 2, offset: 6 * 4,  format: "float32x2" }, // uv
    { shaderLocation: 3, offset: 8 * 4,  format: "float32x3" }, // bary
  ],
};

const TWO_TARGETS: GPUColorTargetState[] = [
  { format },              // @location(0) — lit color → screen
  { format: "rgba8unorm"}, // @location(1) — normal buffer
];

const shader = device.createShaderModule({ label: "Main Shader", code: shaderCode });

// ── Main pipeline (Flat / Gouraud / Phong / Blinn-Phong / Normal-buffer) ──────
const pipeline = device.createRenderPipeline({
  label:  "Main Pipeline",
  layout: "auto",
  vertex:   { module: shader, entryPoint: "vs_main", buffers: [VERTEX_LAYOUT] },
  fragment: { module: shader, entryPoint: "fs_main", targets: TWO_TARGETS },
  primitive:    { topology: "triangle-list", cullMode: "back" },
  depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
});

const bindGroup = device.createBindGroup({
  layout:  pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});

// ── Wireframe pipeline (depth compare: always, back-face cull = hidden surface removal) ──
const wireframePipeline = device.createRenderPipeline({
  label:  "Wireframe Pipeline",
  layout: "auto",
  vertex:   { module: shader, entryPoint: "vs_main", buffers: [VERTEX_LAYOUT] },
  fragment: { module: shader, entryPoint: "fs_main", targets: TWO_TARGETS },
  primitive:    { topology: "triangle-list", cullMode: "back" },
  depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
});

const wireframeBindGroup = device.createBindGroup({
  layout:  wireframePipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});

// ── Shared OBJ load helper ────────────────────────────────────────────────────
async function loadAndUploadOBJ(
  url: string,
  modelMatrix: (mesh: IndexedMesh) => Float32Array,
  camZ: number
) {
  const mesh = await loadOBJ(url);
  computeNormals(mesh);

  const old = vertexBuffer;
  old.destroy();
  ({ buf: vertexBuffer, count: vertexCount } = buildOBJBuffers(mesh));
  meshModelMatrix = modelMatrix(mesh);
  camera.position = [0, 0, camZ];
}

// ── GUI ───────────────────────────────────────────────────────────────────────
initGUI(
  // Predefined shapes
  async shape => {
    activeShape = shape;

    if (shape === "cube" || shape === "sphere") {
      const old = vertexBuffer;
      old.destroy();
      ({ buf: vertexBuffer, count: vertexCount } = buildVertexBuffer(shape));
      meshModelMatrix = mat4.identity();
      camera.position = [0, 0, 5];
      return;
    }

    if (shape === "teapot") {
      // Bounding box: center=[0.217,1.575,0], min=[-3,0,-2], max=[3.434,3.15,2.0]
      await loadAndUploadOBJ(
        "/obj_models/teapot.obj",
        () => {
          const cx=0.217, cy=1.575, cz=0;
          const dx=6.434, dy=3.15, dz=4.0;
          const scale = 1 / (Math.sqrt(dx*dx+dy*dy+dz*dz)/2);
          return mat4.multiply(mat4.scaling(scale,scale,scale), mat4.translation(-cx,-cy,-cz));
        },
        2.5
      );
      return;
    }

    if (shape === "beacon") {
      // Bounding sphere: center=[125,125,125], radius=125
      await loadAndUploadOBJ(
        "/obj_models/KAUST_Beacon.obj",
        () => {
          const scale = 1 / 125;
          return mat4.multiply(mat4.scaling(scale,scale,scale), mat4.translation(-125,-125,-125));
        },
        2.5
      );
    }
  },

  // Custom file upload
  async file => {
    activeShape = "custom";
    const url = URL.createObjectURL(file);
    await loadAndUploadOBJ(
      url,
      mesh => {
        const { cx, cy, cz, scale } = computeMeshBounds(mesh);
        return mat4.multiply(mat4.scaling(scale,scale,scale), mat4.translation(-cx,-cy,-cz));
      },
      2.5
    );
    URL.revokeObjectURL(url); // free memory
  }
);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new Camera();
camera.position = [0, 0, 5];
const keys = new Set<string>();
window.addEventListener("keydown", e => keys.add(e.key));
window.addEventListener("keyup",   e => keys.delete(e.key));

// ── Arcball (Task 4) — Algorithm 2 from Shoemake 1994 ────────────────────────
let arcLastRotation:    Quat = quat.identity(); // last_rotation
let arcCurrentRotation: Quat = quat.identity(); // current_rotation
let arcStartX = 0, arcStartY = 0;
let arcDragging = false;

function toNDC(px: number, py: number): [number, number] {
  return [
     (px / canvas.clientWidth)  * 2 - 1,
    -((py / canvas.clientHeight) * 2 - 1),
  ];
}

canvas.addEventListener("mousedown", e => {
  arcDragging = true;
  [arcStartX, arcStartY] = toNDC(e.clientX, e.clientY);
  arcCurrentRotation = quat.identity();
});

canvas.addEventListener("mousemove", e => {
  if (!arcDragging) return;
  const [cx, cy] = toNDC(e.clientX, e.clientY);
  arcCurrentRotation = quat.computeRotation(cx, cy, arcStartX, arcStartY);
});

canvas.addEventListener("mouseup", () => {
  arcLastRotation    = quat.multiply(arcCurrentRotation, arcLastRotation);
  arcCurrentRotation = quat.identity();
  arcDragging        = false;
});

canvas.addEventListener("mouseleave", () => {
  if (!arcDragging) return;
  arcLastRotation    = quat.multiply(arcCurrentRotation, arcLastRotation);
  arcCurrentRotation = quat.identity();
  arcDragging        = false;
});

// ── Render loop ───────────────────────────────────────────────────────────────
let lastTime    = performance.now();
const startTime = performance.now();

function frame(now: number) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime  = now;
  const t   = (now - startTime) / 1000;

  camera.update(keys, dt);

  const aspect = canvas.width / canvas.height;
  const proj   = mat4.perspective((60 * Math.PI) / 180, aspect, 0.1, 100);
  const view   = camera.getViewMatrix();

  // Arcball rotation applied on top of the mesh's center/scale matrix
  const arcRotation = quat.toMat4(quat.multiply(arcCurrentRotation, arcLastRotation));
  const model       = mat4.multiply(arcRotation, meshModelMatrix);
  const normM       = mat4.normalMatrix(model);
  const mvp         = mat4.multiply(mat4.multiply(proj, view), model);

  let lx = gui.lightX, ly = gui.lightY, lz = gui.lightZ;
  if (gui.autoRotLight) {
    lx = Math.cos(t * 0.8) * 4.5;
    lz = Math.sin(t * 0.8) * 4.5;
    updateLightDisplay(lx, lz);
  }

  const [or, og, ob] = hexToRgb(gui.objectColor);
  const [lr, lg, lb] = hexToRgb(gui.lightColor);

  uData.set(mvp,   0);
  uData.set(model, 16);
  uData.set(normM, 32);
  uData[48]=lx; uData[49]=ly; uData[50]=lz; uData[51]=0;
  uData[52]=lr; uData[53]=lg; uData[54]=lb; uData[55]=0;
  uData[56]=gui.ambient; uData[57]=gui.diffuse; uData[58]=gui.specular; uData[59]=gui.shininess;
  uData[60]=camera.position[0]; uData[61]=camera.position[1]; uData[62]=camera.position[2];
  uData32[63] = gui.modelId;
  uData[64]=or; uData[65]=og; uData[66]=ob;
  uData[67]=t;

  device.queue.writeBuffer(uniformBuffer, 0, uArrayBuf);

  const encoder = device.createCommandEncoder();
  const isWireframe = gui.modelId === 4;

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view:       context.getCurrentTexture().createView(),
        clearValue: { r: 0.08, g: 0.08, b: 0.12, a: 1 },
        loadOp:     "clear",
        storeOp:    "store",
      },
      {
        view:       normalTexture!.createView(),
        clearValue: { r: 0.5, g: 0.5, b: 1.0, a: 1 },
        loadOp:     "clear",
        storeOp:    "store",
      },
    ],
    depthStencilAttachment: {
      view:            depthTexture!.createView(),
      depthClearValue: 1,
      depthLoadOp:     "clear",
      depthStoreOp:    "store",
    },
  });

  pass.setPipeline(isWireframe ? wireframePipeline : pipeline);
  pass.setBindGroup(0, isWireframe ? wireframeBindGroup : bindGroup);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertexCount);
  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);