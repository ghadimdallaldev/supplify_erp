import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from './Header';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('Header', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{component}</BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('should render header with logo', () => {
    renderWithProviders(<Header />);

    expect(screen.getByText(/Supplify/i)).toBeInTheDocument();
  });

  it('should render user menu when authenticated', () => {
    // Mock user data
    vi.mock('../services/api', () => ({
      api: {
        get: vi.fn().mockResolvedValue({
          data: {
            ok: true,
            data: {
              user: {
                id: 'user-1',
                email: 'test@example.com',
                role: 'RESTAURANT',
              },
            },
          },
        }),
      },
    }));

    renderWithProviders(<Header />);

    // Check for user menu elements
    expect(screen.getByText(/test@example.com/i)).toBeInTheDocument();
  });
});
