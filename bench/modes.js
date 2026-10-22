// Teste de img2img e inpaint: node bench/modes.js [host:porta]
// Entrada: mesma imagem (RealVisXL do sweep) para os dois modelos. Máscara com borda suavizada sobre o chapéu (branco = repintar).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { negative, SEED, run, upload } from './comfy.js';

const checkpoints = ['sd_xl_base_1.0.safetensors', 'RealVisXL_V5.0_fp16.safetensors'];
const input = () => readFileSync(new URL('./out/sweep/RealVisXL_V5.0_fp16__25-6.5-dpmpp_2m-karras-1024.png', import.meta.url));
const mask = readFileSync(new URL('./out/mask.png', import.meta.url));
const fisherman = 'portrait of an elderly fisherman with a weathered face and white beard, wearing a yellow raincoat, natural light, 85mm photo';
const tests = [
  ...[0.2, 0.3, 0.4, 0.6, 0.8].map((denoise) => ({ mode: 'img2img', denoise, prompt: fisherman })),
  ...[0.75, 0.9].map((denoise) => ({ mode: 'inpaint', denoise, prompt: 'a red knitted beanie, natural light, 85mm photo' })),
];

mkdirSync(new URL('./out/modes/', import.meta.url), { recursive: true });
const results = [];
for (const ckpt of checkpoints) {
  const inName = await upload(input(), 'localia_input.png');
  const maskName = await upload(mask, 'localia_mask.png');
  for (const t of tests) {
    const wf = JSON.parse(readFileSync(new URL(`../workflows/${t.mode}.json`, import.meta.url)));
    wf['1'].inputs.ckpt_name = ckpt;
    wf['2'].inputs.text = t.prompt;
    wf['3'].inputs.text = negative;
    wf['4'].inputs.image = inName;
    if (t.mode === 'inpaint') wf['9'].inputs.image = maskName;
    wf['6'].inputs.seed = SEED;
    wf['6'].inputs.denoise = t.denoise;
    const file = `${ckpt.replace('.safetensors', '')}__${t.mode}-${t.denoise}.png`;
    try {
      const { seconds, peak, bytes } = await run(wf);
      writeFileSync(new URL(`./out/modes/${file}`, import.meta.url), bytes);
      results.push({ ckpt, mode: t.mode, denoise: t.denoise, file, seconds: +seconds.toFixed(1), peakVramMB: peak });
    } catch (e) {
      results.push({ ckpt, mode: t.mode, denoise: t.denoise, file, error: String(e.message).slice(0, 300) });
    }
    console.log(results.at(-1));
  }
}
writeFileSync(new URL('./modes-results.json', import.meta.url), JSON.stringify(results, null, 2));
