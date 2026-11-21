import React, {useEffect, useState} from 'react';
import {request} from './api';

export function useRemote(path: string | null, revision = 0) {
  const [state, setState] = useState<{data: any; loading: boolean; error: string}>({data: null, loading: !!path, error: ''});
  useEffect(() => {
    let active = true;
    if (!path) { setState({data: null, loading: false, error: ''}); return; }
    setState({data: null, loading: true, error: ''});
    request(path).then(data => {
      if (active) setState({data, loading: false, error: ''});
    }).catch(error => {
      if (active) setState({data: null, loading: false, error: error.message});
    });
    return () => { active = false; };
  }, [path, revision]);
  return state;
}
export const today = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const dateText = (value: any) => {
  if (!value) return '—';
  const d = String(value);
  return d.length >= 10 ? d.slice(0, 10) : d;
};
export function Section({title, actions, children}: {title: string; actions?: React.ReactNode; children: React.ReactNode}) {
  return <section className="section"><div className="section-title"><h2>{title}</h2>{actions}</div>{children}</section>;
}
export function Notice({children, error = false}: {children: React.ReactNode; error?: boolean}) {
  return <div className={'notice' + (error ? ' error' : '')}>{children}</div>;
}
export function Wait({state}: {state: {loading: boolean; error: string}}) {
  if (state.loading) return <div className="empty">جارٍ تحميل البيانات…</div>;
  if (state.error) return <Notice error>{state.error}</Notice>;
  return null;
}
export function Metric({label, value}: {label: string; value: any}) {
  return <div className="stat"><span>{label}</span><strong>{value ?? '—'}</strong></div>;
}
export function Empty({title = 'لا توجد بيانات'}: {title?: string}) {
  return <div className="empty">{title}</div>;
}
export function Action({children, onClick, disabled, danger = false}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return <button type="button" disabled={disabled} className={'btn ' + (danger ? 'danger' : 'primary')} onClick={onClick}>{children}</button>;
}
export function ArrayList({items, columns}: {
  items: any[]; columns: {label: string; show: (item: any) => React.ReactNode}[];
}) {
  if (!items.length) return <Empty />;
  return <div className="v2-table-wrap"><table className="v2-table"><thead><tr>{columns.map((c, i) =>
    <th key={i}>{c.label}</th>)}</tr></thead><tbody>{items.map((item, i) =>
      <tr key={item.id || i}>{columns.map((c, j) => <td key={j}>{c.show(item)}</td>)}</tr>
    )}</tbody></table></div>;
}
export function Failure({error}: {error: string}) {
  return error ? <Notice error>{error}</Notice> : null;
}
export function Done({message}: {message: string}) {
  return message ? <div className="notice success">{message}</div> : null;
}
export function SelectMany({items, selected, onChange, label}: {
  items: {id: string; name: string}[]; selected: string[]; onChange: (values: string[]) => void; label: string
}) {
  return <div className="v2-selector"><strong>{label}</strong><div className="v2-checkbox-grid">{items.map(item =>
    <label key={item.id} className="check-item"><input type="checkbox" checked={selected.includes(item.id)}
      onChange={e => onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/>{item.name}</label>)}</div></div>;
}
