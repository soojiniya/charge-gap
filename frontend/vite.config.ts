import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Flask 백엔드 CORS 기본 허용 origin(http://localhost:5173, http://127.0.0.1:5173)에 맞춰 5173 포트를 고정합니다.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 공통 라이브러리를 별도 청크로 분리해 메인 번들이 경고 기준(700kB)을 넘지 않게 합니다. 동작 변화 없음.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light|recharts-scale)[\\/]/.test(id)) return 'vendor-charts';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@tanstack)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
