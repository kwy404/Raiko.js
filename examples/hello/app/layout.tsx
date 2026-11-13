export const metadata = { title: { default: 'Raiko example', template: '%s | Raiko example' } }

export default function Layout({ children }: { children?: any }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/monsooncss@0.2.0/dist/monsoon.min.css" />
      </head>
      <body style="font-family:system-ui;max-width:640px;margin:48px auto;padding:0 16px">{children}</body>
    </html>
  )
}
