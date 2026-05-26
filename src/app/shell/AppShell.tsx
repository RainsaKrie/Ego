import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/workbench', label: '对话工作台' },
  { to: '/analytics', label: '会话分析' },
  { to: '/settings', label: '全局设置' },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地优先 AI 工作台</p>
          <h1>Ego</h1>
        </div>
        <nav className="topnav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'topnav-link active' : 'topnav-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page-frame">
        <Outlet />
      </main>
    </div>
  )
}
