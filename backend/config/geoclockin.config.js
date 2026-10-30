/**
 * GeoClockIN initial data.
 *
 * Used once, to seed an empty database: the organisation settings, the first
 * employees and the first admin account. After that, everything here is
 * managed from the admin dashboard (/admin) and stored in the database —
 * editing this file does not change an existing installation.
 */
export default {
  company: {
    name: 'ABC Technologies',
    email: 'hr@abctech.com',
    phone: '+91 98765 43200',
    address: '123 Business Rd, Chennai, Tamil Nadu',
  },

  office: {
    name: 'ABC Tech Park',
    address: '123 Business Rd, Chennai, Tamil Nadu',
    latitude: 12.9894,
    longitude: 80.2486,
    // Attendance is accepted only within this distance of the coordinates above.
    radiusMeters: 150,
  },

  schedule: {
    // IANA time zone used for work dates, late status and all reported times.
    timezone: 'Asia/Kolkata',
    workStart: '09:00',
    workEnd: '18:00',
    // Check-ins later than workStart + graceMinutes are marked late.
    graceMinutes: 15,
    // 0 = Sunday … 6 = Saturday.
    workdays: [1, 2, 3, 4, 5],
    // Company holidays. Not counted as absences.
    holidays: [],
    // Absences are only counted from this date (system go-live) or the
    // employee's joining date, whichever is later.
    trackingStartDate: '2026-10-01',
  },

  departments: ['Engineering', 'Design', 'Quality Assurance', 'Human Resources', 'Operations'],

  // Generate a password hash with: npm run hash-password -- "<password>"
  admins: [
    {
      name: 'Admin',
      email: 'admin@abctech.com',
      passwordHash: '$2b$10$6dTUf/dAIamYawjCb5VZuO59L3a1hFGrGfwV.dpQQURTHwb1ZxOsK',
    },
  ],

  employees: [
    {
      id: 'EMP001',
      name: 'John Doe',
      email: 'john.doe@abctech.com',
      designation: 'Software Engineer',
      department: 'Engineering',
      phone: '+91 98765 43210',
      joinedOn: '2023-06-12',
      active: true,
      passwordHash: '$2b$10$5Qa95byxn02AF4W0Q0.DZutT1ilN7NOabArSbU39TZ3.obwoP4Wky',
    },
    {
      id: 'EMP002',
      name: 'Priya Sharma',
      email: 'priya.sharma@abctech.com',
      designation: 'Product Designer',
      department: 'Design',
      phone: '+91 98765 43211',
      joinedOn: '2024-02-01',
      active: true,
      passwordHash: '$2b$10$47q5KQyhWWuCKgyBTxtKouBhwcoVmqLpzDbMUuuGvBP8JXVf0Epty',
    },
    {
      id: 'EMP003',
      name: 'Arjun Kumar',
      email: 'arjun.kumar@abctech.com',
      designation: 'QA Engineer',
      department: 'Quality Assurance',
      phone: '+91 98765 43212',
      joinedOn: '2022-09-19',
      active: false,
      passwordHash: '$2b$10$8FvQ7ZQgsYsN2U0.F6voZeg8Xj4zk8QMmtNn66fhAmMCL90CrJ2G2',
    },
  ],
};
