import { COMPANION_FURNITURE, COMPANION_SKINS, COMPANION_ACCESSORIES } from './companion-catalog';
export type CompanionAssetKind = 'skin' | 'accessory' | 'furniture';
export interface CompanionSpriteState {
  row: number;
  frames: number;
}
export type CompanionPose = 'idle' | 'happy' | 'recording' | 'resting' | 'gift';
export interface CompanionAssetDefinition {
  poseSources?: Partial<Record<CompanionPose, string>>;
  layer?: 'ground' | 'wall' | 'object';
  vector?: string;
  src: string;
  previewSrc?: string;
  placeholder: boolean;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  fps: number;
  states: Record<'idle' | 'walk' | 'interact', CompanionSpriteState>;
  label: string;
  color: string;
}
/** Stable save IDs point to the user's finished campus artwork. */
export const COMPANION_ASSET_OVERRIDES: Partial<
  Record<CompanionAssetKind, Record<string, Partial<CompanionAssetDefinition>>>
> = {
  skin: {
    sprout: {
      src: '/assets/companion/tutu_map.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
      poseSources: {
        happy: '/pages/companion/assets/tutu_happy.png',
        recording: '/pages/companion/assets/tutu_recording.png',
        resting: '/pages/companion/assets/tutu_resting.png',
        gift: '/pages/companion/assets/tutu_gift.png',
      },
    },
    sunshine: {
      src: '/assets/companion/yeye_diary.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    sky: {
      src: '/assets/companion/kaka_camera.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    peach: {
      src: '/assets/companion/diandian_pin.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    lavender: {
      src: '/assets/companion/yaya_ginkgo.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    cocoa: {
      src: '/assets/companion/youyou_letter.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    mint: {
      src: '/assets/companion/yinyin_stamp.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
    night: {
      src: '/assets/companion/xingxing_star.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
    },
  },
  furniture: {
    bench: {
      src: '/pages/companion/assets/ginkgo_reading_chair.png',
      width: 210,
      height: 210,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    tree: {
      src: '/pages/companion/assets/ginkgo_window_bonsai.png',
      width: 135,
      height: 135,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    desk: {
      src: '/pages/companion/assets/wenshizhe_book_side_table.png',
      width: 155,
      height: 155,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    bookshelf: {
      src: '/pages/companion/assets/jixia_windchime_screen.png',
      width: 210,
      height: 210,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    lamp: {
      src: '/pages/companion/assets/magnolia_floor_lamp.png',
      width: 170,
      height: 170,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    flowers: {
      src: '/pages/companion/assets/sdu_1901_memory_mailbox.png',
      width: 145,
      height: 145,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    picnic: {
      src: '/pages/companion/assets/magnolia_ginkgo_rug.png',
      width: 280,
      height: 280,
      anchorX: 0.5,
      anchorY: 0.6,
      layer: 'ground',
    },
    pond: {
      src: '/pages/companion/assets/pond.svg',
      width: 240,
      height: 132,
      anchorX: 0.5,
      anchorY: 0.5,
      layer: 'ground',
      vector: 'pond',
    },
    cushion: {
      src: '/pages/companion/assets/cushion.svg',
      width: 150,
      height: 82.5,
      anchorX: 0.5,
      anchorY: 0.5,
      layer: 'ground',
      vector: 'cushion',
    },
    bicycle: {
      src: '/pages/companion/assets/alumni_gate_garden_arch.png',
      width: 285,
      height: 285,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    lantern: {
      src: '/pages/companion/assets/zhixin_memory_lamp.png',
      width: 150,
      height: 150,
      anchorX: 0.5,
      anchorY: 0.93,
      layer: 'object',
    },
    sign: {
      src: '/pages/companion/assets/sdu_motto_wall_plaque.png',
      width: 170,
      height: 170,
      anchorX: 0.5,
      anchorY: 0.5,
      layer: 'wall',
    },
    shanhai_collectible_chest: {
      src: '/pages/companion/assets/shanhai_collectible_chest.png',
      width: 125,
      height: 125.0,
      anchorX: 0.5163,
      anchorY: 0.9458,
      layer: 'object',
    },
    sdu_red_graduation_rack: {
      src: '/pages/companion/assets/sdu_red_graduation_rack.png',
      width: 190,
      height: 190.0,
      anchorX: 0.5307,
      anchorY: 0.9577,
      layer: 'object',
    },
    dacheng_eight_relief_platform: {
      src: '/pages/companion/assets/dacheng_eight_relief_platform.png',
      width: 290,
      height: 290.0,
      anchorX: 0.5024,
      anchorY: 0.7927,
      layer: 'ground',
    },
    dacheng_cong_garden_lantern: {
      src: '/pages/companion/assets/dacheng_cong_garden_lantern.png',
      width: 130,
      height: 130.0,
      anchorX: 0.4996,
      anchorY: 0.9482,
      layer: 'object',
    },
    grove_memory_swing: {
      src: '/pages/companion/assets/grove_memory_swing.png',
      width: 250,
      height: 250.0,
      anchorX: 0.5199,
      anchorY: 0.9378,
      layer: 'object',
    },
    doctoral_cat_bookends: {
      src: '/pages/companion/assets/doctoral_cat_bookends.png',
      width: 100,
      height: 100.0,
      anchorX: 0.5171,
      anchorY: 0.9761,
      layer: 'object',
    },
    campus_postmark_workbench: {
      src: '/pages/companion/assets/campus_postmark_workbench.png',
      width: 220,
      height: 220.0,
      anchorX: 0.5056,
      anchorY: 0.9298,
      layer: 'object',
    },
    three_cities_travel_sign: {
      src: '/pages/companion/assets/three_cities_travel_sign.png',
      width: 140,
      height: 140.0,
      anchorX: 0.5283,
      anchorY: 0.949,
      layer: 'object',
    },
    three_cities_souvenir_cabinet: {
      src: '/pages/companion/assets/three_cities_souvenir_cabinet.png',
      width: 260,
      height: 173.3333,
      anchorX: 0.5094,
      anchorY: 0.9609,
      layer: 'object',
    },
    majia_twin_dome_model: {
      src: '/pages/companion/assets/majia_twin_dome_model.png',
      width: 155,
      height: 155.0,
      anchorX: 0.5032,
      anchorY: 0.886,
      layer: 'object',
    },
    majia_stargazing_telescope: {
      src: '/pages/companion/assets/majia_stargazing_telescope.png',
      width: 185,
      height: 185.0,
      anchorX: 0.5108,
      anchorY: 0.9426,
      layer: 'object',
    },
    starmap_observation_table: {
      src: '/pages/companion/assets/starmap_observation_table.png',
      width: 200,
      height: 200.0,
      anchorX: 0.5064,
      anchorY: 0.8772,
      layer: 'object',
    },
  },
  accessory: {
    scarf: {
      src: '/pages/companion/assets/scarf.svg',
      vector: 'scarf',
      width: 60,
      height: 50,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    hat: {
      src: '/pages/companion/assets/hat.svg',
      vector: 'hat',
      width: 60,
      height: 50,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    book: {
      src: '/pages/companion/assets/book.svg',
      vector: 'book',
      width: 60,
      height: 50,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    headphones: {
      src: '/pages/companion/assets/headphones.svg',
      vector: 'headphones',
      width: 60,
      height: 50,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    flower: {
      src: '/pages/companion/assets/flower.svg',
      vector: 'flower',
      width: 60,
      height: 50,
      anchorX: 0.5,
      anchorY: 0.5,
    },
  },
};
export const COMPANION_ROOM_BACKGROUND = '/pages/companion/assets/campus_corner.jpg';
const COMPANION_THEME_BACKGROUNDS = {
  meadow: { src: '/pages/companion/assets/ginkgo_playable_v2.jpg', width: 800, height: 1100 },
  dusk: { src: '/pages/companion/assets/jixia_playable_v2.jpg', width: 800, height: 1100 },
  blossom: { src: COMPANION_ROOM_BACKGROUND, width: 1000, height: 750 },
};
export function companionThemeBackground(theme: string) {
  return (
    COMPANION_THEME_BACKGROUNDS[theme as keyof typeof COMPANION_THEME_BACKGROUNDS] ??
    COMPANION_THEME_BACKGROUNDS.meadow
  );
}
export function companionPoseAsset(id: string, pose: CompanionPose): CompanionAssetDefinition {
  const asset = resolveCompanionAsset('skin', id);
  return { ...asset, src: asset.poseSources?.[pose] ?? asset.src };
}
export function companionFurnitureLayer(id: string): number {
  const layer = resolveCompanionAsset('furniture', id).layer;
  return layer === 'ground' ? 0 : layer === 'wall' ? 1 : 2;
}
export function resolveCompanionAsset(
  kind: CompanionAssetKind,
  id: string,
): CompanionAssetDefinition {
  const catalog =
    kind === 'skin'
      ? COMPANION_SKINS
      : kind === 'accessory'
        ? COMPANION_ACCESSORIES
        : COMPANION_FURNITURE;
  const item = catalog.find((i) => i.id === id);
  const defaults: CompanionAssetDefinition = {
    src: '',
    placeholder: true,
    width: kind === 'furniture' ? 150 : kind === 'accessory' ? 60 : 100,
    height: kind === 'furniture' ? 110 : kind === 'accessory' ? 45 : 110,
    anchorX: 0.5,
    anchorY: kind === 'furniture' ? 0.85 : 0.82,
    frameWidth: 256,
    frameHeight: 256,
    columns: 1,
    rows: 1,
    fps: 8,
    states: {
      idle: { row: 0, frames: 1 },
      walk: { row: 0, frames: 1 },
      interact: { row: 0, frames: 1 },
    },
    label: item?.name ?? '待接入素材',
    color: item?.color ?? '#c4c9c5',
  };
  const override = COMPANION_ASSET_OVERRIDES[kind]?.[id];
  const result = { ...defaults, ...override, states: { ...defaults.states, ...override?.states } };
  result.placeholder = !result.src;
  return result;
}
export function companionSpriteFrame(
  a: CompanionAssetDefinition,
  pose: 'idle' | 'walk' | 'interact',
  seconds: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const state = a.states[pose] ?? a.states.idle;
  const columns = Math.max(1, Math.floor(a.columns));
  const frames = Math.min(columns, Math.max(1, Math.floor(state.frames)));
  const index = Math.floor(Math.max(0, seconds) * Math.max(1, a.fps)) % frames;
  const row = Math.min(Math.max(0, Math.floor(state.row)), Math.max(0, Math.floor(a.rows) - 1));
  return { sx: index * a.frameWidth, sy: row * a.frameHeight, sw: a.frameWidth, sh: a.frameHeight };
}

export function companionAssetPreview(
  kind: CompanionAssetKind,
  id: string,
): { src: string; cropped: boolean; style: string } {
  const asset = resolveCompanionAsset(kind, id);
  if (asset.previewSrc) return { src: asset.previewSrc, cropped: false, style: '' };
  if (!asset.src || (asset.columns <= 1 && asset.rows <= 1))
    return { src: asset.src, cropped: false, style: '' };
  const frame = companionSpriteFrame(asset, 'idle', 0);
  const x = asset.columns > 1 ? (frame.sx / asset.frameWidth / (asset.columns - 1)) * 100 : 0;
  const y = asset.rows > 1 ? (frame.sy / asset.frameHeight / (asset.rows - 1)) * 100 : 0;
  const url = encodeURI(asset.src).replace(/'/g, '%27');
  return {
    src: asset.src,
    cropped: true,
    style:
      "background-image:url('" +
      url +
      "');background-size:" +
      asset.columns * 100 +
      '% ' +
      asset.rows * 100 +
      '%;background-position:' +
      x +
      '% ' +
      y +
      '%;',
  };
}
