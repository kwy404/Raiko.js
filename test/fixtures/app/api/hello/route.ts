export const GET = ({ query }: any) => ({ hello: query.name ?? 'world' })
export const POST = ({ body }: any) => ({ got: body })
