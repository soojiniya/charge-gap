import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, isTransientApiError, serverReadiness } from './api/client';
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
      // 연결 실패·5xx·서버 준비 중(JSON이 아닌 응답)만 한 번 자동 재시도합니다.
      retry: (count, error) => {
        if (error instanceof ApiError && !isTransientApiError(error)) return false;
        return count < 1;
      },
    },
  },
});

// 서버가 다시 준비되면(수동 재시도 포함) 대기 시간 초과 등으로 오류로 끝난 화면의 쿼리를 다시 요청합니다.
// 기다리던 쿼리는 스스로 다시 요청하므로 여기서는 오류 상태인 활성 쿼리만 대상입니다.
serverReadiness.onReady(() => {
  void queryClient.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' });
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
