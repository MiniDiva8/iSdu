export const COMPANION_INSPIRATIONS = [
  {
    id: 'prompt_01',
    category: 'place',
    text: '今天哪处校园角落，让你放慢了脚步？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_02',
    category: 'place',
    text: '同一条路，今天有没有不一样的风景？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_03',
    category: 'place',
    text: '给此刻选一个地点，再写一句话吧。',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_04',
    category: 'place',
    text: '有没有一个平时容易忽略的小地方？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_05',
    category: 'photo',
    text: '如果只留一张照片，你会选今天的哪一张？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_06',
    category: 'photo',
    text: '这张照片里，你最想记住的细节是什么？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_07',
    category: 'photo',
    text: '光线、颜色或天气，让这个画面有什么不同？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_08',
    category: 'photo',
    text: '给今天拍到的一个普通瞬间，写一句注释。',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_09',
    category: 'mood',
    text: '如果愿意，用一个词形容此刻的心情。',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_10',
    category: 'mood',
    text: '今天有没有一件让你稍微轻松一点的小事？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_11',
    category: 'mood',
    text: '不必解释原因，也可以只记下现在的感觉。',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_12',
    category: 'mood',
    text: '想写多少都可以，今天留一句话也很好。',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_13',
    category: 'review',
    text: '翻开一条旧回忆，你首先注意到了什么？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_14',
    category: 'review',
    text: '那时的自己，会对现在的你说什么？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_15',
    category: 'review',
    text: '同一个地点，你已经留下过哪些不同的日子？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_16',
    category: 'review',
    text: '哪张旧照片，让你又想起当时的天气？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_17',
    category: 'daily',
    text: '今天的课间，你记住了什么小片刻？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_18',
    category: 'daily',
    text: '有没有一次普通的散步，值得留一个坐标？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_19',
    category: 'daily',
    text: '一顿饭、一本书，今天想留下哪一个？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_20',
    category: 'daily',
    text: '今天有没有遇见一句想记住的话？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_21',
    category: 'future',
    text: '给下一次经过这里的自己，留一句话吧。',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_22',
    category: 'future',
    text: '想在这个地方，再和谁留下一段回忆？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_23',
    category: 'future',
    text: '如果一个月后再看，你希望记住今天的什么？',
    requiresDiaryReading: false,
  },
  {
    id: 'prompt_24',
    category: 'future',
    text: '未来回到校园时，你会想先打开哪一条记录？',
    requiresDiaryReading: false,
  },
] as const;
export function companionInspiration(index: number) {
  const n = Number.isFinite(index) ? Math.floor(index) : 0;
  return (
    COMPANION_INSPIRATIONS[
      ((n % COMPANION_INSPIRATIONS.length) + COMPANION_INSPIRATIONS.length) %
        COMPANION_INSPIRATIONS.length
    ] ?? COMPANION_INSPIRATIONS[0]
  );
}
export const COMPANION_SCENE_IDEAS = [
  {
    id: 'reading',
    name: '银杏书香角',
    src: '/pages/companion/assets/ginkgo_reading_corner.jpg',
    note: '一把阅读椅、一盏花灯，把课后的时光安放在这里。',
  },
  {
    id: 'courtyard',
    name: '稷下微风庭',
    src: '/pages/companion/assets/jixia_breeze_courtyard.jpg',
    note: '让校友门、风铃和 1901 邮筒，陪你收藏校园的四季。',
  },
  {
    id: 'ritual-grove',
    name: '礼乐小树林',
    src: '/pages/companion/assets/ritual_grove_memory_corner.jpg',
    note: '秋千、藏章盒和玉琮灯，收藏校园午后的从容。',
  },
  {
    id: 'stargazing',
    name: '玛珈山星光庭',
    src: '/pages/companion/assets/majia_starlight_courtyard.jpg',
    note: '一桌星光、两座穹顶，把三城的夜色收进小院。',
  },
] as const;
