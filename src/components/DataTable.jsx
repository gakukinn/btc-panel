import React from 'react';

const DataTable = ({ data, columns, rowClassName }) => (
  <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(5,10,20,0.7)' }}>
    <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10" style={{ background: 'rgba(0,212,255,0.08)', borderBottom: '1px solid rgba(0,212,255,0.2)' }}>
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 font-bold tracking-[0.12em] uppercase text-[10px] ${col.align || 'text-left'}`}
                style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.originalIndex ?? idx}
              className={`transition-colors duration-150 ${rowClassName?.(row, idx) || ''}`}
              style={{ borderBottom: '1px solid rgba(0,212,255,0.06)' }}
            >
              {columns.map((col, i) => (
                <td key={i} className={`px-4 py-3 whitespace-nowrap ${col.align || 'text-left'}`}
                  style={{ fontFamily: "'Share Tech Mono', monospace", color: '#e8f4fd', fontSize: '11px' }}>
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center italic"
                style={{ fontFamily: "'Share Tech Mono', monospace", color: 'rgba(0,212,255,0.3)' }}>
                NO DATA // 没有找到匹配的数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default DataTable;
