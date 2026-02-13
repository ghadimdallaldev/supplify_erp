/// <reference types="vite/client" />

declare module 'papaparse' {
  interface ParseResult<T> {
    data: T[]
  }
  interface ParseConfig<T> {
    header?: boolean
    skipEmptyLines?: boolean
    complete?: (results: ParseResult<T>) => void
    error?: (error: Error) => void
  }
  function parse<T = unknown>(input: string | File, config?: ParseConfig<T>): ParseResult<T>
  export { parse }
}
