/** All vectors are in world space; the Sun direction is shared with the habitat key light. */
export const planetVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const earthFragment = /* glsl */ `
  uniform sampler2D uSurface;
  uniform sampler2D uClouds;
  uniform sampler2D uOcean;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float sunHeight = dot(n, uSun);
    float daylight = smoothstep(-0.065, 0.12, sunHeight);
    vec3 albedo = texture2D(uSurface, vUv).rgb;
    float cloudShadow = texture2D(uClouds, vUv + vec2(0.0018, -0.001)).r;
    float diffuse = max(sunHeight, 0.0);
    vec3 color = albedo * (0.012 + daylight * (0.075 + diffuse * 1.8));
    color *= 1.0 - cloudShadow * daylight * 0.22;
    float ocean = texture2D(uOcean, vUv).r;
    vec3 halfway = normalize(uSun + viewDirection);
    float specular = pow(max(dot(n, halfway), 0.0), 95.0);
    color += vec3(1.0, 0.93, 0.8) * specular * ocean * daylight * 0.32;
    float limb = pow(1.0 - max(dot(n, viewDirection), 0.0), 4.0);
    color += vec3(0.025, 0.12, 0.27) * limb * daylight * 0.32;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const cloudFragment = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    float density = texture2D(uClouds, vUv).r;
    float sunHeight = dot(normalize(vWorldNormal), uSun);
    float day = smoothstep(-0.05, 0.1, sunHeight);
    vec3 color = vec3(0.82, 0.9, 1.0) * (0.009 + day * (0.16 + max(sunHeight, 0.0) * 1.5));
    gl_FragColor = vec4(color, smoothstep(0.06, 0.85, density) * 0.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facing = max(dot(n, viewDirection), 0.0);
    float sunHeight = dot(n, uSun);
    float day = smoothstep(-0.18, 0.3, sunHeight);
    float rim = pow(1.0 - facing, 6.0);
    float twilight = (1.0 - smoothstep(0.0, 0.22, abs(sunHeight))) * 0.3;
    vec3 blue = mix(vec3(0.055, 0.27, 0.7), vec3(0.24, 0.57, 1.0), facing);
    vec3 color = mix(blue, vec3(0.8, 0.3, 0.1), twilight);
    gl_FragColor = vec4(color, rim * day * 0.26);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
