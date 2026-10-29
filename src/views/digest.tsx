import type { DigestRow } from '../digest/types.js';

const columnCount = 8;

export function DigestPage({
  night,
  rows,
  malformedLines,
}: {
  night: string;
  rows: DigestRow[];
  malformedLines: number;
}) {
  const sortedRows = [...rows].sort((left, right) =>
    left.job < right.job ? -1 : left.job > right.job ? 1 : 0,
  );

  return (
    <>
      <h1>digest · {night}</h1>
      {malformedLines > 0 && (
        <p class="warn">
          {malformedLines} malformed {malformedLines === 1 ? 'line' : 'lines'}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">job</th>
            <th scope="col">owner</th>
            <th scope="col">runs</th>
            <th scope="col">retries</th>
            <th scope="col">last status</th>
            <th scope="col">last error</th>
            <th scope="col">first at</th>
            <th scope="col">last at</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colspan={columnCount} class="mute">
                {malformedLines === 0 ? 'nothing ran' : 'no valid runs'}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr class={row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
