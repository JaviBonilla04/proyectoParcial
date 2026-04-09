// ─────────────────────────────────────────────────────────────────────────────────────────
// OBJ Loader

export interface IndexedMesh {  
  positions : Float32Array;   // flat [x,y,z, x,y,z, ...]
  normals   : Float32Array;   // flat [nx,ny,nz, ...] normales
  uvs       : Float32Array;   // flat [u,v, u,v, ...]
  indices   : Uint32Array;    // triangle indices [i0,i1,i2, ...]
}

function faceKey(pi: number, ti: number, ni: number): string {
  return `${pi}/${ti}/${ni}`;
}

export async function loadOBJ(url: string): Promise<IndexedMesh> {
  const text = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch OBJ: ${url} (${r.status})`);
    return r.text();
  });

  const rawPos : number[] = [];
  const rawUV  : number[] = [];
  const rawNorm: number[] = [];

  const outPos : number[] = [];
  const outUV  : number[] = [];
  const outNorm: number[] = [];
  const outIdx : number[] = [];

  const vertexMap = new Map<string, number>();

  function getVertex(pi: number, ti: number, ni: number): number {
    const key = faceKey(pi, ti, ni);
    if (vertexMap.has(key)) return vertexMap.get(key)!;

    const idx = outPos.length / 3;
    vertexMap.set(key, idx);

    outPos.push(rawPos[pi * 3], rawPos[pi * 3 + 1], rawPos[pi * 3 + 2]);

    if (ti >= 0 && rawUV.length > 0) {
      outUV.push(rawUV[ti * 2], rawUV[ti * 2 + 1]);
    } else {
      outUV.push(0, 0);
    }

    if (ni >= 0 && rawNorm.length > 0) {
      outNorm.push(rawNorm[ni * 3], rawNorm[ni * 3 + 1], rawNorm[ni * 3 + 2]);
    } else {
      outNorm.push(0, 0, 0);
    }

    return idx;
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const token = parts[0];

    if (token === 'v') {
      rawPos.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (token === 'vt') {
      rawUV.push(parseFloat(parts[1]), parseFloat(parts[2]));
    } else if (token === 'vn') {
      rawNorm.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (token === 'f') {
      const corners: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const sub = parts[i].split('/');
        const pi = parseInt(sub[0]) - 1;
        const ti = sub[1] && sub[1] !== '' ? parseInt(sub[1]) - 1 : -1;
        const ni = sub[2] && sub[2] !== '' ? parseInt(sub[2]) - 1 : -1;
        corners.push(getVertex(pi, ti, ni));
      }
      for (let i = 1; i + 1 < corners.length; i++) {
        outIdx.push(corners[0], corners[i], corners[i + 1]);
      }
    }
  }

  return {
    positions : new Float32Array(outPos),
    normals   : new Float32Array(outNorm),
    uvs       : new Float32Array(outUV),
    indices   : new Uint32Array(outIdx),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
//  Per-face & vertex normal computation
export function computeNormals(mesh: IndexedMesh): void {
  const { positions, indices } = mesh;
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];

    const ax = positions[i0*3], ay = positions[i0*3+1], az = positions[i0*3+2];
    const bx = positions[i1*3], by = positions[i1*3+1], bz = positions[i1*3+2];
    const cx = positions[i2*3], cy = positions[i2*3+1], cz = positions[i2*3+2];

    const ex = bx-ax, ey = by-ay, ez = bz-az;
    const fx = cx-ax, fy = cy-ay, fz = cz-az;

    const nx = ey*fz - ez*fy;
    const ny = ez*fx - ex*fz;
    const nz = ex*fy - ey*fx;

    normals[i0*3]+=nx; normals[i0*3+1]+=ny; normals[i0*3+2]+=nz;
    normals[i1*3]+=nx; normals[i1*3+1]+=ny; normals[i1*3+2]+=nz;
    normals[i2*3]+=nx; normals[i2*3+1]+=ny; normals[i2*3+2]+=nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i], ny = normals[i+1], nz = normals[i+2];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    if (len > 0.00001) {
      normals[i]   /= len;
      normals[i+1] /= len;
      normals[i+2] /= len;
    }
  }

  mesh.normals = normals;
}