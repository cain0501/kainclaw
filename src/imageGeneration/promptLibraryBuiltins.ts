export type PromptLibraryPreview =
  | { kind: "gradient"; value: string }
  | { kind: "image"; src: string };

export type BuiltinPromptDefinition = {
  id: string;
  category: string;
  title: string;
  text: string;
  tags: string[];
  preview: PromptLibraryPreview;
};

export const BUILTIN_PROMPTS: BuiltinPromptDefinition[] = [
  {
    id: "bp01",
    category: "人像",
    title: "日系写真",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#ffecd2,#fcb69f)" },
    text: "Soft-focus Japanese portrait, young woman in linen dress, afternoon sunlight through shoji screens, film grain, 35mm Kodak Portra 400, shallow depth of field",
    tags: ["写实", "日系", "人像"],
  },
  {
    id: "bp02",
    category: "人像",
    title: "古风仙女",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#f8d7da,#e8a0b0)" },
    text: "中国古风汉服美女，站在桃花树下，飘逸长袖，精致妆容，水墨晕染背景，仙气飘飘，超写实，4K",
    tags: ["古风", "中国风", "人像"],
  },
  {
    id: "bp03",
    category: "人像",
    title: "赛博女郎",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#0f0c29,#302b63)" },
    text: "Cyberpunk girl with neon face tattoos, wet reflective street, rain atmosphere, bokeh neon signs, Blade Runner aesthetic, hyperrealistic photography",
    tags: ["赛博朋克", "人像", "夜景"],
  },
  {
    id: "bp04",
    category: "人像",
    title: "棚拍商业",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#e0e0e0,#f5f5f5)" },
    text: "Professional studio portrait, confident businesswoman, clean white background, soft box lighting, sharp focus, commercial photography style",
    tags: ["商业", "人像", "棚拍"],
  },
  {
    id: "bp05",
    category: "风景",
    title: "日出山峦",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#f6d365,#fda085)" },
    text: "Misty mountain sunrise, golden hour light rays, pine trees silhouette, Chinese ink wash painting style, panoramic composition, 8K",
    tags: ["山水", "日出", "风景"],
  },
  {
    id: "bp06",
    category: "风景",
    title: "星空极光",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#1a1a2e,#16213e)" },
    text: "Northern lights over frozen lake, vivid green and purple aurora borealis, perfect reflection in ice, long exposure photography, Iceland, 8K ultra detail",
    tags: ["极光", "星空", "夜景"],
  },
  {
    id: "bp07",
    category: "风景",
    title: "梯田云海",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#96fbc4,#f9f586)" },
    text: "云南元阳梯田，日出时分云海翻涌，金色光芒照耀层层梯田，航拍视角，超高清摄影",
    tags: ["风景", "中国风", "航拍"],
  },
  {
    id: "bp08",
    category: "产品",
    title: "护肤品摄影",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#fdfcfb,#e2d1c3)" },
    text: "Premium skincare serum bottle on white marble, side natural light, water droplets, fresh eucalyptus leaves, commercial product photography, minimal background",
    tags: ["产品", "护肤", "商业"],
  },
  {
    id: "bp09",
    category: "产品",
    title: "极简科技",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#e0e0e0,#bdbdbd)" },
    text: "Minimalist smartphone flat lay, clean white surface, subtle long shadow, studio light, ultra high detail, Apple-inspired product photography",
    tags: ["产品", "科技", "极简"],
  },
  {
    id: "bp10",
    category: "产品",
    title: "咖啡时光",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#c79081,#dfa579)" },
    text: "Latte art in ceramic cup, warm shallow bokeh coffee shop background, morning golden hour, cozy atmosphere, food photography, top angle shot",
    tags: ["产品", "咖啡", "美食"],
  },
  {
    id: "bp11",
    category: "动漫",
    title: "二次元少女",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#a18cd1,#fbc2eb)" },
    text: "1girl, anime illustration, cherry blossom petals falling, pastel pink hair, school uniform, looking up at sky, detailed eyes, KyoAni animation style, soft lighting",
    tags: ["动漫", "二次元"],
  },
  {
    id: "bp12",
    category: "动漫",
    title: "奇幻冒险",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#ffd89b,#19547b)" },
    text: "Genshin Impact style character, glowing fantasy armor, epic mountain landscape, magical particles, golden light, detailed illustration, trending on ArtStation",
    tags: ["动漫", "游戏", "奇幻"],
  },
  {
    id: "bp13",
    category: "动漫",
    title: "赛博机甲",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#2afadf,#4c83ff)" },
    text: "Mech pilot girl in futuristic cockpit, holographic displays, neon glow, anime style, expressive eyes, dramatic backlighting, Evangelion-inspired design",
    tags: ["动漫", "科幻", "机甲"],
  },
  {
    id: "bp14",
    category: "建筑",
    title: "未来都市",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#1c1c2e,#2e2e5c)" },
    text: "Futuristic megacity skyline at night, flying vehicles, giant holographic advertisements, rain-soaked streets, reflections, Blade Runner 2049 cinematography",
    tags: ["建筑", "科幻", "城市"],
  },
  {
    id: "bp15",
    category: "建筑",
    title: "古典庭院",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#f6d365,#c53030)" },
    text: "中国古典苏州园林，白墙黑瓦，荷花池倒影，月洞门框景，黄昏暖光，超写实摄影，8K",
    tags: ["建筑", "中国风", "古典"],
  },
  {
    id: "bp16",
    category: "建筑",
    title: "极简空间",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#a1c4fd,#c2e9fb)" },
    text: "Minimalist concrete interior, Tadao Ando inspired, shaft of natural light creating geometric shadows, clean lines, architectural photography, high contrast",
    tags: ["建筑", "极简", "室内"],
  },
  {
    id: "bp17",
    category: "概念",
    title: "宇宙探索",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#0f0c29,#7b2ff7)" },
    text: "Astronaut drifting in colorful nebula, Earth visible below, ultra-detailed space suit, NASA photography quality, photorealistic, 8K resolution",
    tags: ["概念", "太空", "科幻"],
  },
  {
    id: "bp18",
    category: "概念",
    title: "水下遗迹",
    preview: { kind: "gradient", value: "linear-gradient(135deg,#005c97,#363795)" },
    text: "Underwater ancient temple ruins, shafts of sunlight penetrating deep ocean, bioluminescent fish, coral overgrown columns, cinematic, ultra detailed, 8K",
    tags: ["概念", "水下", "神秘"],
  },
];
