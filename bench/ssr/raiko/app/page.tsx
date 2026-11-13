async function items() {
  return Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Item ${i}`, price: (i * 3.7).toFixed(2) }))
}
export default async function Page() {
  const list = await items()
  return (
    <main>
      <h1>Products</h1>
      <ul>{list.map((p) => <li><b>{p.name}</b> <span>${p.price}</span></li>)}</ul>
    </main>
  )
}
