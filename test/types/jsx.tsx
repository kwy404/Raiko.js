// compile only: async components, arrays and null are valid JSX elements
import { Suspense } from '../../src'
async function Async() {
  await Promise.resolve()
  return <p>async</p>
}
const List = () => [<li>a</li>, <li>b</li>]
const Nothing = () => null
const Text = () => 'text'
export const tree = (
  <Suspense fallback={<p>...</p>}>
    <Async />
    <ul><List /></ul>
    <Nothing />
    <Text />
    <button v-on:click="n++" class={['a', false && 'b']} style={{ marginTop: 4 }}>x</button>
  </Suspense>
)
