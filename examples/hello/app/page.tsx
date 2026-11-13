export default async function Home() {
  const now = new Date().toLocaleTimeString()
  return (
    <main>
      <h1>Raiko is running</h1>
      <p>This page rendered on the server at {now}. Edit examples/hello/app/page.tsx and save.</p>
      <div v-data="{ n: 0 }"><button class="btn btn-primary" v-on:click="n++">Clicked {'{ n }'} times</button></div>
      <p><a href="/api/time">/api/time</a></p>
    </main>
  )
}
