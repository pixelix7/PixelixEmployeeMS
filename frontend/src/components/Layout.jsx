import {useState} from "react";
import {NavLink, Outlet} from "react-router-dom";
import {useAuth} from "../context/useAuth";
import {APP_NAME, ROLES, ROLE_LABELS} from "../config";
import {
    CalendarIcon,
    ChevronRightIcon,
    ClipboardIcon,
    PhoneIcon,
    CloseIcon,
    GridIcon,
    LogoMark,
    LogoutIcon,
    MenuIcon,
    ReportIcon,
    SettingsIcon,
    UsersIcon,
} from "./Icons";
import "./Layout.css";

// `roles` limits a link to certain roles; no `roles` means everyone sees it
const NAV_ITEMS = [
    {to: "/dashboard", label: "Dashboard", Icon: GridIcon},
    {
        to: "/employees",
        label: "Employees",
        Icon: UsersIcon,
        roles: [ROLES.ADMIN],
    },
    {
        to: "/attendance",
        label: "Attendance",
        Icon: CalendarIcon,
        roles: [ROLES.ADMIN],
    },
    {
        to: "/reports/daily",
        label: "Daily Report",
        Icon: ReportIcon,
        roles: [ROLES.ADMIN],
    },
    {
        to: "/leads",
        label: "Leads (Telecaller)",
        Icon: PhoneIcon,
        roles: [ROLES.TELECALLER, ROLES.ADMIN],
    },
    {
        to: "/work",
        label: "Work Log (Digital Marketing)",
        Icon: ClipboardIcon,
        roles: [ROLES.DIGITAL_MARKETING, ROLES.ADMIN],
    },
    {to: "/settings", label: "Settings", Icon: SettingsIcon},
];

export default function Layout() {
    const {user, logout} = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);

    const items = NAV_ITEMS.filter(
        (item) => !item.roles || item.roles.includes(user.role),
    );
    const closeMenu = () => setMenuOpen(false);

    return (
        <div className="shell">
            {/* Mobile top bar */}
            <header className="topbar">
                <div className="brand">
                    <LogoMark width={28} height={28} />
                    <span className="brand-name">{APP_NAME}</span>
                </div>
                <button
                    type="button"
                    className="topbar-btn"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open menu"
                >
                    <MenuIcon width={20} height={20} />
                </button>
            </header>

            {menuOpen && (
                <div className="sidebar-backdrop" onClick={closeMenu} />
            )}

            <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
                <div className="sidebar-head">
                    <div className="brand">
                        <LogoMark width={28} height={28} />
                        <div>
                            <div className="brand-name">{APP_NAME}</div>
                            <div className="brand-sub">Management System</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="topbar-btn sidebar-close"
                        onClick={closeMenu}
                        aria-label="Close menu"
                    >
                        <CloseIcon width={18} height={18} />
                    </button>
                </div>

                <div className="sidebar-user">
                    <span className="avatar">{user.firstName[0]}</span>
                    <div className="sidebar-user-text">
                        <div className="sidebar-user-name">
                            {user.firstName} {user.lastName}
                        </div>
                        <div className="sidebar-user-role">
                            {ROLE_LABELS[user.role]}
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav" aria-label="Main">
                    <p className="sidebar-label">Navigation</p>
                    {items.map(({to, label, Icon}) => (
                        <NavLink
                            key={to}
                            to={to}
                            className="nav-link"
                            onClick={closeMenu}
                        >
                            <Icon />
                            <span>{label}</span>
                            <ChevronRightIcon className="nav-chevron" />
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-foot">
                    <button type="button" className="nav-link" onClick={logout}>
                        <LogoutIcon />
                        <span>Log out</span>
                    </button>
                </div>
            </aside>

            <main className="content">
                <div className="content-inner">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
