export default function Docs({ params }: { params: { path: string[] } }) {
  return <p>{params.path.join('|')}</p>
}
