import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input Component', () => {
  it('should render input with placeholder', () => {
    const { container } = render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    expect(container.querySelector('input')).toHaveAttribute('placeholder', 'Enter text');
  });

  it('should handle value changes', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    const { container } = render(<Input onChange={handleChange} data-testid="input-change" />);
    const input = container.querySelector('input');
    expect(input).toBeInTheDocument();
    if (input) await user.type(input, 'test');

    expect(handleChange).toHaveBeenCalled();
  });

  it('should be disabled when disabled prop is true', () => {
    const { container } = render(<Input disabled />);
    const input = container.querySelector('input');
    expect(input).toBeDisabled();
  });

  it('should display error state', () => {
    const { container } = render(<Input error />);
    const input = container.querySelector('input');
    expect(input).toHaveClass('error');
  });
});
