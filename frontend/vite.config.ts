import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { ALLOW_LOCAL_API_BUILD_ENV, apiBaseUrlProblem } from './src/config/apiBaseUrl';

// Flask 백엔드 CORS 기본 허용 origin(http://localhost:5173, http://127.0.0.1:5173)에 맞춰 5173 포트를 고정합니다.
export default defineConfig(({ command, mode }) => {
  // Production 빌드에서 API 주소가 없거나 localhost이면 배포 전에 빌드를 실패시킵니다.
  // 로컬 미리보기 빌드만 CHARGE_GAP_ALLOW_LOCAL_API_BUILD=1 로 명시적으로 허용합니다.
  if (command === 'build' && mode === 'production' && process.env[ALLOW_LOCAL_API_BUILD_ENV] !== '1') {
    const problem = apiBaseUrlProblem(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL);
    if (problem) {
      throw new Error(`[CHARGE GAP] ${problem} 배포 백엔드 주소를 VITE_API_BASE_URL에 설정하세요. 로컬 미리보기 빌드만 ${ALLOW_LOCAL_API_BUILD_ENV}=1 로 허용합니다.`);
    }
  }
  return {
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
  };
});
