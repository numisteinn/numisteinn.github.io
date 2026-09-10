import * as THREE from "three";

const deformation = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uTravel;
uniform float uSpring;
float field(vec3 p) {
  return (sin(p.x * 3.1 + sin(p.z * 2.4)) * sin(p.y * 2.7 - p.z * 1.3)
    + 0.5 * sin(p.z * 5.2 + p.x * 2.1) * cos(p.y * 4.3)) / 1.5;
}
vec3 distort(vec3 p) {
  vec3 n = normalize(p);
  float t = uTime;
  float imperfections = 0.005 * field(n * 1.7) + 0.0005 * field(n * 5.0);
  float breathe = 0.012 * field(n * 0.8 + vec3(t * 0.17, t * 0.12, -t * 0.13));
  float waves = sin(n.y * 10.0 - t * 3.8 + uTravel * 4.0 + field(n * 1.2) * 0.6);
  waves += 0.3 * sin(dot(n, normalize(vec3(1.0, 0.5, 0.7))) * 15.0 + t * 2.6 - uTravel * 3.0);
  float liquid = field(n * 1.4 + vec3(t * 0.24, uTravel * 0.25, t * -0.2));
  float ripple_strength = 1.1;
  float wave_travel = 0.05;
  float liquid_distortion = 0.09;
  float displacement = imperfections + breathe + ripple_strength * uEnergy * (wave_travel * waves + liquid_distortion * liquid);
  vec3 result = n * (length(p) + displacement);
  result.x += uSpring * 0.065 * (1.0 - n.y * n.y);
  result.y *= 1.0 + uSpring * 0.04;
  return result;
}
`;

export function createSurface() {
  const uniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uTravel: { value: 0 },
    uSpring: { value: 0 },
    uNormalMatrix: { value: new THREE.Matrix3() },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: "#f1eeea",
    metalness: 1,
    roughness: 0.09,
    clearcoat: 0,
    envMapIntensity: 1,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "varying vec3 vSurfacePosition;\n" + deformation + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "vSurfacePosition = position; vec3 transformed = distort(position);",
    );
    shader.fragmentShader =
      "varying vec3 vSurfacePosition;\nuniform mat3 uNormalMatrix;\n" +
      deformation +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      /* glsl */ `
      #include <normal_fragment_begin>
      vec3 position = normalize(vSurfacePosition) * 1.08;
      vec3 direction = normalize(position);
      vec3 axis = abs(direction.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 tangent = normalize(cross(axis, direction));
      vec3 bitangent = normalize(cross(direction, tangent));
      float epsilon = 0.001;
      vec3 alongT = distort(normalize(position + tangent * epsilon) * 1.08)
                  - distort(normalize(position - tangent * epsilon) * 1.08);
      vec3 alongB = distort(normalize(position + bitangent * epsilon) * 1.08)
                  - distort(normalize(position - bitangent * epsilon) * 1.08);
      normal = normalize(uNormalMatrix * normalize(cross(alongT, alongB)));
      nonPerturbedNormal = normal;
    `,
    );
  };
  return { material, uniforms };
}
