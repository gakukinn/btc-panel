import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* 禅意数据表 — 宣纸底色 + 淡墨边框 */
const DataTable = ({ data, columns, rowClassName }) => (
  <div
    className="rounded overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar"
    style={{
      border: '1px solid var(--ink-border)',
      background: 'var(--silk-white)',
    }}
  >
    <Table>
      <TableHeader
        className="sticky top-0 z-10"
        style={{
          background: 'var(--xuan-paper)',
          borderBottom: '1px solid var(--ink-border)',
        }}
      >
        <TableRow className="hover:bg-transparent" style={{ borderBottom: 'none' }}>
          {columns.map((col, i) => (
            <TableHead
              key={i}
              className={`font-sans-cn text-xs tracking-widest ${col.align || 'text-left'}`}
              style={{ color: 'var(--ink-mid)', fontWeight: 500, paddingTop: '10px', paddingBottom: '10px' }}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-24 text-center font-sans-cn"
              style={{ color: 'var(--ink-mid)' }}
            >
              暂无数据
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, idx) => (
            <TableRow
              key={row.originalIndex ?? idx}
              className={`tr-hover transition-colors ${rowClassName?.(row, idx) || ''}`}
              style={{ borderBottom: '1px solid rgba(200,191,174,0.4)' }}
            >
              {columns.map((col, i) => (
                <TableCell
                  key={i}
                  className={`font-mono-tech tabular-nums text-sm ${col.align || 'text-left'}`}
                  style={{ color: 'var(--ink-dark)' }}
                >
                  {col.render(row, idx)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);

export default DataTable;
