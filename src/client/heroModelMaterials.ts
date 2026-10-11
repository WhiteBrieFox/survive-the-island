import {
  Box3,
  CanvasTexture,
  Color,
  Mesh,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
  type Texture
} from "three";

export type HeroModelName = "explorer" | "shark" | "sea-serpent" | "kaiju" | "raft";

const preparedModels = new WeakMap<Object3D, Map<string, Object3D>>();

function rgbToHsv(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max
  };
}

function hsvToRgb(hue: number, saturation: number, value: number) {
  const sector = Math.floor(hue * 6);
  const fraction = hue * 6 - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - fraction * saturation);
  const t = value * (1 - (1 - fraction) * saturation);

  switch (sector % 6) {
    case 0: return [value, t, p];
    case 1: return [q, value, p];
    case 2: return [p, value, t];
    case 3: return [p, q, value];
    case 4: return [t, p, value];
    default: return [value, p, q];
  }
}

function tintExplorerTexture(source: Texture, playerColor: string) {
  const image = source.image as CanvasImageSource & { width?: number; height?: number };
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  if (!width || !height) return source;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return source;

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const target = new Color(playerColor);
  const targetHsv = rgbToHsv(target.r, target.g, target.b);

  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index] / 255;
    const green = pixels.data[index + 1] / 255;
    const blue = pixels.data[index + 2] / 255;
    const sourceHsv = rgbToHsv(red, green, blue);
    const isUniformRed =
      (sourceHsv.hue < 0.055 || sourceHsv.hue > 0.94) &&
      sourceHsv.saturation > 0.42 &&
      red > green * 1.14 &&
      red > blue * 1.08;

    if (!isUniformRed) continue;

    const [nextRed, nextGreen, nextBlue] = hsvToRgb(
      targetHsv.hue,
      Math.max(targetHsv.saturation * 0.78, sourceHsv.saturation * 0.72),
      sourceHsv.value
    );
    pixels.data[index] = Math.round(nextRed * 255);
    pixels.data[index + 1] = Math.round(nextGreen * 255);
    pixels.data[index + 2] = Math.round(nextBlue * 255);
  }

  context.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = source.flipY;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.generateMipmaps = source.generateMipmaps;
  texture.anisotropy = source.anisotropy;
  texture.name = `${source.name}-${playerColor}`;
  texture.needsUpdate = true;
  return texture;
}

function cloneMaterial(source: Material, name: HeroModelName, playerColor: string) {
  const material = source.clone();
  if (name !== "explorer" || !("map" in material)) return material;

  const map = material.map as Texture | null;
  if (map) material.map = tintExplorerTexture(map, playerColor);
  return material;
}

function buildHeroModel(source: Object3D, name: HeroModelName, playerColor: string) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => cloneMaterial(material, name, playerColor))
      : cloneMaterial(object.material, name, playerColor);
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const bounds = new Box3().setFromObject(clone);
  const center = bounds.getCenter(new Vector3());
  clone.position.set(-center.x, -bounds.min.y, -center.z);
  return clone;
}

export function prepareHeroModel(source: Object3D, name: HeroModelName, playerColor = "#b52f29") {
  let variants = preparedModels.get(source);
  if (!variants) {
    variants = new Map();
    preparedModels.set(source, variants);
  }

  const key = name === "explorer" ? `${name}-${playerColor}` : name;
  let prepared = variants.get(key);
  if (!prepared) {
    prepared = buildHeroModel(source, name, playerColor);
    variants.set(key, prepared);
  }
  return prepared.clone(true);
}
