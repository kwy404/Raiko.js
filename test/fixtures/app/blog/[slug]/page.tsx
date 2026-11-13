import { notFound, redirect, usePathname } from '../../../../../src/server/request-store'
export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `Post ${params.slug}` }
}
export default async function Post({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string> }) {
  if (params.slug === 'missing') notFound()
  if (params.slug === 'old') redirect('/blog/new')
  await new Promise((r) => setTimeout(r, 1))
  return <article><h1>{params.slug}</h1><p>{usePathname()}</p><p>{searchParams.ref ?? ''}</p></article>
}
export const actions = {
  like: async (data: Record<string, string>) => ({ liked: data.who }),
}
