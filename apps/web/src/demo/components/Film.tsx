import { useCallback, useEffect, useRef, useState } from 'react'
import { useSite } from './SiteProvider'

const MEDIA = '/demo/assets/media/'
const PORTRAIT_QUERY = '(max-width: 600px) and (orientation: portrait)'
const CAPTIONS = `${MEDIA}supplify-film-v3.en.vtt`

export function Film() {
  const { track, openDemo } = useSite()
  const [portrait, setPortrait] = useState(() => window.matchMedia(PORTRAIT_QUERY).matches)
  const [playbackPortrait, setPlaybackPortrait] = useState(portrait)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  const done = useRef(false)
  const video = useRef<HTMLVideoElement>(null)
  // Select the best composition while idle. Keep it during playback so rotating
  // a phone never restarts the film or discards its current position.
  const format = (playing ? playbackPortrait : portrait) ? 'portrait' : 'landscape'
  const film = `${MEDIA}supplify-film-v3-${format}.mp4`
  const poster = `${MEDIA}supplify-film-v3-${format}.jpg`

  useEffect(() => {
    const query = window.matchMedia(PORTRAIT_QUERY)
    const update = () => setPortrait(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const start = useCallback(() => {
    if (!playing) setPlaybackPortrait(portrait)
    setFailed(false)
    setPlaying(true)
    const player = video.current
    if (failed) player?.load()
    // Play directly in the click handler to preserve iOS user activation.
    player?.play().catch(() => undefined)
  }, [playing, portrait, failed])

  useEffect(() => {
    window.addEventListener('hx:play-film', start)
    return () => window.removeEventListener('hx:play-film', start)
  }, [start])

  return (
    <section className="film" id="film" aria-labelledby="film-h">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">The film · 60 seconds</p>
          <h2 id="film-h">One minute, from the first order to the door.</h2>
        </div>
        <div className="film-frame" data-format={format} data-state={playing ? 'playing' : 'idle'}>
          <video
            ref={video}
            src={film}
            poster={poster}
            controls={playing}
            playsInline
            preload="none"
            aria-label="Supplify: Every order, one line."
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
            <track kind="captions" src={CAPTIONS} srcLang="en" label="English" />
          </video>
          {!playing && (
            <button type="button" className="film-play" onClick={start}>
              <span className="film-play-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M6 3v16l14-8z" fill="currentColor" />
                </svg>
              </span>
              <span>{failed ? 'Try the film again' : 'Play the film'}</span>
            </button>
          )}
        </div>
        <p className="film-caption">An illustrated product story. English captions included.</p>
        {failed && (
          <p className="film-error" role="status">
            The film could not load. Try again or{' '}
            <button type="button" className="link" onClick={() => openDemo('film-unavailable')}>
              request a personal demo
            </button>
            .
          </p>
        )}
      </div>
    </section>
  )
}
