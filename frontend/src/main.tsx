import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api/client';
import '@fontsource-variable/archivo/standard.css';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import './styles/tokens.css';
import './styles/global.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // API는 서버 시작 시 읽은 고정 스냅샷이므로 한 번 받은 응답을 오래 재사용합니다.
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      // 400(잘못된 요청변수)·404는 재시도해도 같으므로 재시도하지 않습니다.
      retry: (count, error) => {
        if (error instanceof ApiError && error.status !== null && error.status < 500) return false;
        return count < 1;
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
