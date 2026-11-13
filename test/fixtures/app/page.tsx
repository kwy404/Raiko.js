import { Link } from '../../../src/components'
export default function Home() {
  return <main><h1>Home</h1><Link href="/about">About</Link><div v-data="{ n: 0 }"><button v-on:click="n++">+</button></div></main>
}
