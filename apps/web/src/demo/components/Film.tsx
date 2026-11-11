'use client'
import { useEffect, useRef, useState } from 'react'
import { useSite } from './SiteProvider'
import { useAssetExists, useInView, useReducedMotion } from '@/demo/lib/hooks'

const FILM = '/demo/assets/media/supplify-film-web.mp4'
const POSTER = '/demo/assets/media/supplify-film-poster.jpg'
const CAPTIONS = '/demo/assets/media/supplify-film-captions.en.vtt'

export function Film() {
  const { track, openDemo } = useSite()
  const available = useAssetExists(FILM)
  const posterOk = useAssetExists(POSTER)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  const done = useRef(false)
  const video = useRef<HTMLVideoElement>(null)
  const loopExists = useAssetExists('/demo/assets/media/supplify-hero-loop.mp4')
  const reduced = useReducedMotion()
  const [frameRef, inView] = useInView<HTMLDivElement>(0.35)
  const [loopOn, setLoopOn] = useState(false)
  const [loopReady, setLoopReady] = useState(false)

  // Poster first. The silent loop only loads once the frame is in view, never on reduced motion or data saver.
  useEffect(() => {
    if (!loopExists || reduced || !inView) return
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return
    setLoopOn(true)
  }, [loopExists, reduced, inView])

  const start = () => {
    if (available === false) {
      setFailed(true)
      return
    }
    setFailed(false)
    setPlaying(true)
  }

  useEffect(() => {
    const on = () => start()
    window.addEventListener('hx:play-film', on)
    return () => window.removeEventListener('hx:play-film', on)
  })

  useEffect(() => {
    if (playing) video.current?.play().catch(() => undefined)
  }, [playing])

  return (
    <section className="film" id="film" aria-labelledby="film-h">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">The film · 60 seconds</p>
          <h2 id="film-h">One minute, from the first order to the door.</h2>
        </div>
        <div ref={frameRef} className="film-frame" data-state={playing ? 'playing' : 'idle'}>
          {playing && !failed ? (
            <video
              ref={video}
              controls
              playsInline
              preload="metadata"
              poster={posterOk ? POSTER : undefined}
              onPlay={() => {
                if (!started.current) {
                  started.current = true
                  track('video_start')
                }
              }}
              onEnded={() => {
                if (!done.current) {
                  done.current = true
                  track('video_complete')
                }
              }}
              onError={() => {
                setPlaying(false)
                setFailed(true)
              }}
            >
              <source src={FILM} type="video/mp4" />
              <track kind="captions" src={CAPTIONS} srcLang="en" label="English" />
            </video>
          ) : (
            <>
              {posterOk && (
                <img className="film-poster" src={POSTER} alt="" loading="lazy" decoding="async" />
              )}
              {loopOn && !playing && (
                <video
                  className="film-loop"
                  data-ready={loopReady}
                  src="/demo/assets/media/supplify-hero-loop.mp4"
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="auto"
                  aria-hidden="true"
                  onLoadedData={() => setLoopReady(true)}
                  onError={() => setLoopOn(false)}
                />
              )}
              {available === false ? (
                <div className="film-soon" data-testid="film-soon">
                  <div className="film-slot" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <p className="eyebrow">60 seconds · English captions</p>
                  <p className="film-soon-title">Every order, one line.</p>
                  <p className="film-soon-note">
                    The film is being finished and will play right here. Until then, try the
                    walkthrough below or ask for a personal demo.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openDemo('film-soon')}
                  >
                    Request a personal demo
                  </button>
                </div>
              ) : (
                <button type="button" className="film-play" onClick={start}>
                  <span className="film-play-icon">
                    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                      <path d="M6 3v16l14-8z" fill="currentColor" />
                    </svg>
                  </span>
                  <span>Play the film</span>
                </button>
              )}
              {failed && (
                <p className="film-msg" role="status">
                  The film could not be loaded right now. Request a personal demo and we will show
                  it to you live.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
