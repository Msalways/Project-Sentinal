const SQL_ERROR_PATTERNS = [
  /SQL syntax.*MySQL/i,
  /Warning.*mysql_.*\(\)/i,
  /MySQLSyntaxErrorException/i,
  /valid MySQL result/i,
  /PostgreSQL.*ERROR/i,
  /Warning.*\Wpg_.*\(\)/i,
  /valid PostgreSQL result/i,
  /SQLite\/JDBCDriver/i,
  /SQLite.Exception/i,
  /System\.Data\.SQLite\.SQLiteException/i,
  /Warning.*sqlite_.*\(\)/i,
  /valid SQLite/i,
  /SQLite\.DatabaseCorruptException/i,
  /ORA-[0-9]{5}/i,
  /Oracle.*Driver/i,
  /SQL Server.*Driver/i,
  /Driver.*SQL Server/i,
  /DB2.*SQL error/i,
  /SQL error.*DB2/i,
  /ODBC.*Driver.*SQL/i,
  /Microsoft.*ODBC.*SQL/i,
  /Unclosed quotation mark/i,
  /Incorrect syntax near/i,
  /Syntax error in string/i,
  /Division by zero/i,
  /unexpected T_STRING/i,
  /mysql_fetch_array/i,
  /mysql_num_rows/i,
  /mysql_query\(\)/i,
  /pg_query\(\)/i,
  /oci_parse\(\)/i,
  /SQL command not properly ended/i,
  /supplied argument is not a valid MySQL/i,
  /Column.*not found/i,
  /Table.*doesn't exist/i,
  /Unknown column/i,
  /Unknown table/i,
  /You have an error in your SQL syntax/i,
];

export function hasSqlError(body: string): boolean {
  return SQL_ERROR_PATTERNS.some((pattern) => pattern.test(body));
}

export function isPayloadReflected(body: string, payload: string): boolean {
  if (body.includes(payload)) return true;
  const encoded = encodeURI(payload);
  if (body.includes(encoded)) return true;
  const htmlEncoded = payload
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  if (body.includes(htmlEncoded)) return true;
  return false;
}

export function isEndpointAlive(status: number): boolean {
  return status !== 404 && status !== 410;
}
