declare module "sql.js" {
  export interface SqlJsQueryResult {
    columns: string[]
    values: any[][]
  }

  export interface Statement {
    bind(values: ArrayLike<number | string | Uint8Array | null>): void
    step(): boolean
    getAsObject<T = Record<string, unknown>>(): T
    free(): void
  }

  export interface Database {
    exec(sql: string): SqlJsQueryResult[]
    prepare(sql: string): Statement
    close(): void
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}

declare module "sql.js/dist/sql-wasm.js" {
  import initSqlJs from "sql.js"
  export default initSqlJs
}
