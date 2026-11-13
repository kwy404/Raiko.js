export const metadata = { title: 'Bench', description: 'Same page in both frameworks' }
export default function RootLayout({ children }: { children?: any }) {
  return <html lang="en"><body>{children}</body></html>
}
