import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  const logo = readFileSync(join(process.cwd(), 'public', 'vouqis-logo.jpg')).toString('base64')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09070F',
          borderRadius: 7,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${logo}`}
          width={26}
          height={30}
          style={{ objectFit: 'contain' }}
          alt=""
        />
      </div>
    ),
    { ...size }
  )
}
