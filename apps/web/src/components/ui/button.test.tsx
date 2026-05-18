import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

describe('Button Component', () => {
  it('should render button with text', () => {
    const { container } = render(<Button>Click me</Button>)
    expect(container.querySelector('button')).toHaveTextContent('Click me')
  })

  it('should handle click events', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    const { container } = render(<Button onClick={handleClick}>Click me</Button>)
    const button = container.querySelector('button')
    expect(button).toBeInTheDocument()
    if (button) await user.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should be disabled when disabled prop is true', () => {
    const { container } = render(<Button disabled>Disabled Button</Button>)
    const button = container.querySelector('button')
    expect(button).toBeDisabled()
  })

  it('should apply variant classes', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>)
    const button = container.querySelector('button')
    expect(button?.className).toMatch(/destructive|var\(--red\)/)
  })

  it('should apply size classes', () => {
    const { container } = render(<Button size="lg">Large Button</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('h-11')
  })
})
