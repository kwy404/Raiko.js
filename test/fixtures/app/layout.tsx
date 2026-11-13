export const metadata = { title: { default: 'Site', template: '%s | Site' }, description: 'Fixture' }
export default function Root({ children }: { children?: any }) {
  return (
    <html lang="en">
      <head><meta charset="utf-8" /></head>
      <body><nav>nav</nav>{children}</body>
    </html>
  )
}
