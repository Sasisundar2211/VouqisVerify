import type { ReactNode, CSSProperties } from 'react'

export function Container({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`mx-auto ${className}`}
      style={{ maxWidth: 1400, padding: '0 clamp(20px, 5vw, 72px)', ...style }}
    >
      {children}
    </div>
  )
}
