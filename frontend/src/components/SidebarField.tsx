import type { ReactNode } from 'react';

export default function SidebarField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="sidebar-field">
      <div className="sidebar-field__label">{label}</div>
      <div className="sidebar-field__value">{children}</div>
    </div>
  );
}
