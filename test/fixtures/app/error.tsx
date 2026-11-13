export default function Err({ error }: { error: Error }) {
  return <h1>Custom error: {error.message}</h1>
}
