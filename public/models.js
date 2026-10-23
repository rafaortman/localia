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
