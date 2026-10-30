// Gazetted holidays of Central Government offices in India (DoPT list for
// Delhi/New Delhi): 2026 from O.M. F.No.12/2/2023-JCA dated 3 July 2025,
// 2027 from the O.M. dated 16 July 2026. Islamic festival dates can move with
// the moon sighting; DoPT announces any change. Admins can edit the list.

export const INDIAN_GAZETTED_HOLIDAYS = {
  2026: [
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-03-04', name: 'Holi' },
    { date: '2026-03-21', name: 'Id-ul-Fitr' },
    { date: '2026-03-26', name: 'Ram Navami' },
    { date: '2026-03-31', name: 'Mahavir Jayanti' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-05-01', name: 'Buddha Purnima' },
    { date: '2026-05-27', name: 'Id-ul-Zuha (Bakrid)' },
    { date: '2026-06-26', name: 'Muharram' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-08-26', name: 'Milad-un-Nabi' },
    { date: '2026-09-04', name: 'Janmashtami' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-10-20', name: 'Dussehra' },
    { date: '2026-11-08', name: 'Diwali' },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
    { date: '2026-12-25', name: 'Christmas' },
  ],
  2027: [
    { date: '2027-01-26', name: 'Republic Day' },
    { date: '2027-03-10', name: 'Id-ul-Fitr' },
    { date: '2027-03-23', name: 'Holi' },
    { date: '2027-03-26', name: 'Good Friday' },
    { date: '2027-04-15', name: 'Ram Navami' },
    { date: '2027-04-19', name: 'Mahavir Jayanti' },
    { date: '2027-05-17', name: 'Id-ul-Zuha (Bakrid)' },
    { date: '2027-05-20', name: 'Buddha Purnima' },
    { date: '2027-06-16', name: 'Muharram' },
    // Independence Day and Milad-un-Nabi fall on the same day.
    { date: '2027-08-15', name: 'Independence Day / Milad-un-Nabi' },
    { date: '2027-08-25', name: 'Janmashtami' },
    { date: '2027-10-02', name: 'Gandhi Jayanti' },
    { date: '2027-10-09', name: 'Dussehra' },
    { date: '2027-10-29', name: 'Diwali' },
    { date: '2027-11-14', name: 'Guru Nanak Jayanti' },
    { date: '2027-12-25', name: 'Christmas' },
  ],
};

/** Holiday lists admins can add from Settings → Attendance Rules. */
export const HOLIDAY_PRESETS = [
  { id: 'india-gazetted', name: 'Indian government holidays', source: 'DoPT gazetted holidays', years: INDIAN_GAZETTED_HOLIDAYS },
];
