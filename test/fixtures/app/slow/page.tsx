export default async function Slow() {
  await new Promise((r) => setTimeout(r, 20))
  return <p>Slow done</p>
}
