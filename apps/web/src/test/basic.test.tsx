import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../App'

describe('Web App Tests', () => {
  it('should render without crashing', () => {
    render(<App />)
    expect(screen.getByText('Supplify')).toBeInTheDocument()
  })
})
