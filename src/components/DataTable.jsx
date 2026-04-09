import React from 'react';

const DataTable = ({ data, columns, rowClassName }) => (
  <div className="overflow-x-auto rounded border border-slate-700 bg-slate-900">
    <div className="max-h-[500px] overflow-y-auto">
      <table className="w-full text-sm border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 shadow-sm">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 font-semibold text-slate-300 ${col.align || 'text-left'}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {data.map((row, idx) => (
            <tr
              key={row.originalIndex ?? idx}
              className={`transition-colors duration-150 hover:bg-slate-700/50 even:bg-slate-800/20 ${rowClassName?.(row, idx) || ''}`}
            >
              {columns.map((col, i) => (
                <td key={i} className={`px-4 py-3 whitespace-nowrap text-slate-100 font-mono-tech ${col.align || 'text-left'}`}>
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500 italic">
                没有找到匹配的数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default DataTable;
