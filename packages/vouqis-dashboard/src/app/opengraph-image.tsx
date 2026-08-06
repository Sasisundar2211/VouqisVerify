import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Vouqis — AI Change Verification'

export default function OgImage() {
  const logo = readFileSync(join(process.cwd(), 'public', 'vouqis-logo.jpg')).toString('base64')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#09070F',
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -160,
            right: -160,
            width: 560,
            height: 560,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(123,61,255,0.35), rgba(123,61,255,0) 70%)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${logo}`}
            width={44}
            height={51}
            style={{ objectFit: 'contain' }}
            alt=""
          />
          <span style={{ fontSize: 26, color: '#C0C0C0', letterSpacing: 4, textTransform: 'uppercase' }}>
            Vouqis
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 920 }}>
          <div style={{ fontSize: 58, lineHeight: 1.08, color: '#F0EEF9', display: 'flex' }}>
            AI change verification for GitHub pull requests
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.4, color: '#C0C0C0', display: 'flex' }}>
            Review packages with evidence on every AI pull request.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
