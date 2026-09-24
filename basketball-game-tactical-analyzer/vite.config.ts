import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({registerType:'autoUpdate',includeAssets:['icon.svg'],manifest:{name:'Basketball Game Tactical Analyzer',short_name:'Tactical Analyzer',description:'試合中の気づきを、短く行動に変えるコーチ支援ツール',theme_color:'#07111f',background_color:'#07111f',display:'standalone',orientation:'any',icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}})],
  test:{environment:'jsdom',setupFiles:'./src/test/setup.ts'}
});
