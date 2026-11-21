const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const ShieldIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const UsersIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5" />
    <path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.8.7 3 2.6 3.5 5.2" />
  </svg>
);

export const ArrowRightIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ArrowLeftIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const EyeIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.7 10.7 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </svg>
);

export const LogoMark = (p) => (
  <svg width={34} height={34} viewBox="0 0 34 34" aria-hidden {...p}>
    <rect width="34" height="34" rx="10" fill="var(--terra)" />
    <rect x="9" y="9" width="7" height="7" rx="2" fill="var(--cream)" />
    <rect x="18" y="9" width="7" height="7" rx="2" fill="var(--sand)" />
    <rect x="9" y="18" width="7" height="7" rx="2" fill="var(--sand)" />
    <rect x="18" y="18" width="7" height="7" rx="2" fill="var(--cream)" opacity=".55" />
  </svg>
);

export const GridIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);

export const UserIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5" />
  </svg>
);

export const SettingsIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
);

export const LogoutIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const ChevronRightIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const MenuIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const CloseIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const PhoneIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" />
  </svg>
);

export const MegaphoneIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" />
    <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
  </svg>
);

export const MailIcon = (p) => (
  <svg {...base} width={18} height={18} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

export const PlusIcon = (p) => (
  <svg {...base} width={16} height={16} strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const SearchIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const PencilIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

export const TrashIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const LockIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);

// Folder, for client projects
export const FolderIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </svg>
);

// Notepad with a pen, for daily work reports
export const NotepadIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-7" />
    <path d="M8 8h5M8 12h4M8 16h6" />
    <path d="M18.5 2.5a2.1 2.1 0 013 3L15 12l-4 1 1-4z" />
  </svg>
);

// Indian rupee sign, for salary
export const RupeeIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 4h12M6 9h12M14 20L7 13h3a4.5 4.5 0 000-9" />
  </svg>
);

export const HistoryIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </svg>
);

// Briefcase, for clients
export const BriefcaseIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" />
  </svg>
);

export const GlobeIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </svg>
);

// Checklist, for assigned tasks
export const TaskIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);

export const BellIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 003.4 0" />
  </svg>
);

export const PinIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
  </svg>
);

// Beach umbrella, for leave
export const LeaveIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 0118 0z" />
    <path d="M12 12v7a2 2 0 01-4 0" />
    <path d="M12 3v1" />
  </svg>
);

export const CalendarIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M16 2.5v4M8 2.5v4M3 10h18" />
  </svg>
);

export const ClockIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const AlarmIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M5 3L2 6M22 6l-3-3" />
  </svg>
);

export const LoginIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
    <path d="M10 17l5-5-5-5M15 12H3" />
  </svg>
);

export const WhatsAppIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M3.5 20.5l1.3-4.3A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.1-1.1z" />
    <path d="M9 8.5c0 3.3 2.2 6.5 6.5 6.5l.9-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z" />
  </svg>
);

export const CheckIcon = (p) => (
  <svg {...base} width={16} height={16} strokeWidth={2.2} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const PadlockIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

export const UploadIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
  </svg>
);

export const ClipboardIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
  </svg>
);

export const DownloadIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M12 4v12M7 11l5 5 5-5" />
    <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
  </svg>
);

export const ReportIcon = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </svg>
);

export const PowerIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M12 3v9" />
    <path d="M6.4 6.6a8 8 0 1011.2 0" />
  </svg>
);
