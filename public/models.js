// Perfis dos modelos de imagem e montagem do grafo do ComfyUI (formato API).
// Os números dos nós vêm dos arquivos em /workflows.

export const DEFAULT_NEGATIVE = 'blurry, low quality, deformed, extra fingers, watermark, text';

export const SAMPLERS = [
  { label: 'dpmpp_2m + karras (padrão)', sampler: 'dpmpp_2m', scheduler: 'karras' },
  { label: 'euler_ancestral + normal', sampler: 'euler_ancestral', scheduler: 'normal' },
  { label: 'dpmpp_2m_sde + karras', sampler: 'dpmpp_2m_sde', scheduler: 'karras' },
];

export const MODELS = {
  zimage: {
    label: 'Z-Image Turbo (padrão)',
    family: 'zimage',
    files: { txt2img: 'zimage-txt2img', img2img: 'zimage-img2img' },
    note: 'Valores fixos do modelo: 8 steps, cfg 1 e sem prompt negativo.',
  },
  sdxl: {
    label: 'SDXL base',
    family: 'sdxl',
    ckpt: 'sd_xl_base_1.0.safetensors',
    files: { txt2img: 'txt2img', img2img: 'img2img' },
    note: 'O SDXL entende descrições (não instruções), não tem memória entre envios e funciona muito melhor em inglês.',
  },
  realvis: {
    label: 'RealVisXL V5.0 (SDXL, fotos)',
    family: 'sdxl',
    ckpt: 'RealVisXL_V5.0_fp16.safetensors',
    files: { txt2img: 'txt2img', img2img: 'img2img' },
    note: 'SDXL treinado para fotos realistas. Funciona melhor com prompts em inglês.',
  },
};

export const DEFAULTS = { steps: 15, cfg: 7, denoise: 0.8 };

export const PRESETS = [
  { label: 'Foto realista', text: 'photorealistic, natural light, 85mm photo, sharp focus, detailed skin texture' },
  { label: 'Cinematográfico', text: 'cinematic still, dramatic lighting, shallow depth of field, film grain, anamorphic lens' },
  { label: 'Ilustração', text: 'digital illustration, clean line art, vibrant colors, detailed, concept art' },
  { label: 'Aquarela', text: 'watercolor painting, soft pastel colors, delicate brushstrokes, paper texture' },
];

// Exemplos de prompt para o campo vazio. O SDXL responde melhor em inglês, então cada lista tem as duas versões.
const EXAMPLES = [
  ['um farol de pedra numa ilha rochosa ao amanhecer, névoa baixa sobre o mar, luz dourada, foto realista',
    'a stone lighthouse on a rocky island at dawn, low mist over the sea, golden light, photorealistic'],
  ['uma raposa-do-ártico dormindo na neve sob uma aurora boreal, cores suaves, ilustração detalhada',
    'an arctic fox sleeping in the snow under an aurora borealis, soft colors, detailed illustration'],
  ['uma biblioteca antiga com estantes altíssimas e raios de sol atravessando a poeira, atmosfera acolhedora, cinematográfico',
    'an old library with towering bookshelves and sunbeams cutting through the dust, cozy atmosphere, cinematic'],
  ['retrato de uma senhora idosa sorrindo, rugas marcadas, luz natural de janela, foto de 85 mm',
    'portrait of a smiling elderly woman, deep wrinkles, natural window light, 85mm photo'],
  ['uma rua de paralelepípedos em Lisboa depois da chuva, bondes amarelos, reflexos nas poças, fim de tarde',
    'a cobblestone street in Lisbon after the rain, yellow trams, reflections in the puddles, late afternoon'],
  ['uma cafeteria aconchegante vista de fora numa noite de inverno, janelas iluminadas, neve caindo, aquarela',
    'a cozy cafe seen from outside on a winter night, glowing windows, falling snow, watercolor'],
  ['um astronauta cultivando um jardim de girassóis num planeta vermelho, luz de pôr do sol, arte conceitual',
    'an astronaut tending a sunflower garden on a red planet, sunset light, concept art'],
  ['um violão de madeira apoiado numa parede de tijolos, luz suave da manhã, foco nítido, fotografia de produto',
    'a wooden acoustic guitar leaning against a brick wall, soft morning light, sharp focus, product photography'],
];

export function randomExample(family, not) {
  const pool = EXAMPLES.map((e) => e[family === 'sdxl' ? 1 : 0]).filter((e) => e !== not);
  return pool[Math.floor(Math.random() * pool.length)];
}

// p: { prompt, negative, seed, steps, cfg, sampler, scheduler, denoise, image }
export async function buildGraph(key, mode, p) {
  const m = MODELS[key];
  const wf = await (await fetch(`/workflows/${m.files[mode]}.json`)).json();
  const edit = mode !== 'txt2img';
  if (m.family === 'zimage') {
    wf['4'].inputs.text = p.prompt;
    wf['8'].inputs.seed = p.seed;
    if (edit) { wf['11'].inputs.image = p.image; wf['8'].inputs.denoise = p.denoise; }
  } else {
    const ks = edit ? '6' : '5';
    wf['1'].inputs.ckpt_name = m.ckpt;
    wf['2'].inputs.text = p.prompt;
    wf['3'].inputs.text = p.negative;
    Object.assign(wf[ks].inputs, { seed: p.seed, steps: p.steps, cfg: p.cfg, sampler_name: p.sampler, scheduler: p.scheduler });
    if (edit) { wf['4'].inputs.image = p.image; wf[ks].inputs.denoise = p.denoise; }
  }
  return wf;
}
