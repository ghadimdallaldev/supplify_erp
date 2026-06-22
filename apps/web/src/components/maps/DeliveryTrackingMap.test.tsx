import { beforeAll, describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { DeliveryTrackingMap } from './DeliveryTrackingMap'
import { testI18n, resetTestI18n } from '../../test/i18n'

const fitToMarkers = vi.fn()

vi.mock('./useDeliveryLeafletMap', () => ({
  useDeliveryLeafletMap: () => ({
    containerRef: { current: null },
    fitToMarkers,
  }),
}))

const t = (key: string, options?: Record<string, unknown>) =>
  testI18n.t(key, { ns: 'fulfillment', ...options })

function renderMap(props: ComponentProps<typeof DeliveryTrackingMap> = {}) {
  return render(
    <I18nextProvider i18n={testI18n}>
      <DeliveryTrackingMap {...props} />
    </I18nextProvider>
  )
}

beforeAll(async () => {
  await resetTestI18n()
})

describe('DeliveryTrackingMap', () => {
  beforeEach(() => {
    fitToMarkers.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows empty state without coordinates', () => {
    renderMap()
    expect(screen.getByTestId('delivery-tracking-map-empty')).toHaveTextContent(
      t('tracking.map.noGpsLocation')
    )
  })

  it('renders recenter button with driver coordinates', () => {
    renderMap({ latitude: 33.8938, longitude: 35.5018, live: true })
    expect(screen.getByTestId('delivery-tracking-map-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-recenter')).toHaveTextContent(
      t('tracking.map.recenter')
    )
    expect(screen.getByTestId('delivery-tracking-map-live')).toHaveTextContent(
      t('tracking.map.liveNow')
    )
  })

  it('recenter calls fitToMarkers', () => {
    renderMap({ latitude: 33.8938, longitude: 35.5018 })
    fireEvent.click(screen.getByTestId('delivery-tracking-map-recenter'))
    expect(fitToMarkers).toHaveBeenCalled()
  })

  it('shows destination-only map and waiting message', () => {
    renderMap({
      destinationLatitude: 33.9,
      destinationLongitude: 35.51,
      destinationLabel: 'Main kitchen',
    })
    expect(screen.getByTestId('delivery-tracking-map-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-waiting-gps')).toHaveTextContent(
      t('tracking.map.waitingForDriver')
    )
  })

  it('shows both driver and destination legend entries', () => {
    renderMap({
      latitude: 33.8938,
      longitude: 35.5018,
      destinationLatitude: 33.91,
      destinationLongitude: 35.52,
      destinationLabel: 'Delivery location',
    })
    expect(screen.getByTestId('delivery-tracking-map-legend')).toHaveTextContent(
      t('tracking.map.driver')
    )
    expect(screen.getByTestId('delivery-tracking-map-legend')).toHaveTextContent(
      'Delivery location'
    )
  })

  it('hides destination pin when showDestinationPin is false', () => {
    renderMap({
      latitude: 33.8938,
      longitude: 35.5018,
      destinationLatitude: 33.91,
      destinationLongitude: 35.52,
      showDestinationPin: false,
    })
    expect(screen.queryByTestId('delivery-tracking-map-waiting-gps')).not.toBeInTheDocument()
    expect(screen.getByTestId('delivery-tracking-map-legend')).not.toHaveTextContent(
      t('tracking.map.deliveryLocation')
    )
  })

  it('shows debug coordinates only when enabled for supplier', () => {
    renderMap({
      latitude: 33.8938,
      longitude: 35.5018,
      destinationLatitude: 33.91,
      destinationLongitude: 35.52,
      showCoordinateDetails: true,
    })
    expect(screen.getByTestId('delivery-tracking-map-debug')).toBeInTheDocument()
    expect(
      screen.getByText(t('tracking.map.driverCoordinates', { lat: '33.89380', lng: '35.50180' }))
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        t('tracking.map.destinationCoordinates', { lat: '33.91000', lng: '35.52000' })
      )
    ).toBeInTheDocument()
  })

  it('shows delivery location not set when driver exists without destination', () => {
    renderMap({ latitude: 33.8938, longitude: 35.5018, showDestinationPin: true })
    expect(screen.getByTestId('delivery-tracking-map-no-destination')).toHaveTextContent(
      t('tracking.map.deliveryLocationNotSet')
    )
  })
})
