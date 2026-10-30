import {
  Building2,
  CalendarDays,
  Clock,
  Globe,
  ImageUp,
  LoaderCircle,
  MapPin,
  Plus,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { CompanyLogo } from '../components/CompanyLogo.jsx';
import { MapPicker } from '../components/MapPicker.jsx';
import { useToast } from '../components/Toast.jsx';
import { EmptyState, PageHead, Skeleton } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';
import { formatClock, formatDate, WEEKDAYS } from '../lib/format.js';

const TABS = [
  { id: 'general', label: 'General', Icon: SettingsIcon },
  { id: 'office', label: 'Office Location', Icon: MapPin },
  { id: 'rules', label: 'Attendance Rules', Icon: Clock },
  { id: 'departments', label: 'Departments', Icon: Building2 },
  { id: 'account', label: 'Account & Security', Icon: ShieldCheck },
];

/** Which tab a server-side validation field belongs to. */
const tabForField = (field = '') =>
  field.startsWith('office')
    ? 'office'
    : field.startsWith('schedule')
      ? 'rules'
      : field.startsWith('departments')
        ? 'departments'
        : 'general';

const TIME_ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Kolkata', 'UTC'];

export default function SettingsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'general';
  const setTab = (id) => setParams(id === 'general' ? {} : { tab: id }, { replace: true });

  const result = useApi('/admin/settings');
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (result.data && !saved) {
      setSaved(result.data);
      setDraft(result.data.settings);
    }
  }, [result.data, saved]);

  const dirty = useMemo(() => draft && saved && JSON.stringify(draft) !== JSON.stringify(saved.settings), [draft, saved]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Updates one section of the draft: update('office', { radiusMeters: 200 }). */
  const update = (section, changes) => setDraft((d) => ({ ...d, [section]: Array.isArray(changes) ? changes : { ...d[section], ...changes } }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await api('/admin/settings', { method: 'PUT', body: { settings: draft } });
      setSaved(next);
      setDraft(next.settings);
      toast.success('Settings saved. The employee app uses them right away.');
    } catch (e) {
      const field = e.data?.field;
      setError({ message: e.message, field });
      if (field) setTab(tabForField(field));
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const orgTab = tab !== 'account';

  return (
    <>
      <PageHead title="Settings" subtitle="Manage your organization settings and attendance rules">
        {orgTab && (
          <>
            <button type="button" className="btn btn--secondary" disabled={!dirty || saving} onClick={() => setDraft(saved.settings)}>
              <Undo2 aria-hidden="true" /> Discard Changes
            </button>
            <button type="button" className="btn btn--primary" disabled={!dirty || saving} onClick={save}>
              {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Save Changes
            </button>
          </>
        )}
      </PageHead>

      <nav className="tabs reveal" aria-label="Settings sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      {dirty && orgTab && (
        <p className="notice notice--info pop-in">
          You have unsaved changes. Save them to apply to the employee app.
        </p>
      )}

      {tab === 'account' ? (
        <AccountTab />
      ) : !draft ? (
        result.error ? (
          <section className="card">
            <EmptyState title="Couldn’t load settings">{result.error.message}</EmptyState>
          </section>
        ) : (
          <section className="card">
            <div className="stack">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={44} radius={12} />
              ))}
            </div>
          </section>
        )
      ) : (
        <div key={tab} className="route-enter">
          {tab === 'general' && <GeneralTab draft={draft} update={update} error={error} />}
          {tab === 'office' && <OfficeTab draft={draft} update={update} error={error} />}
          {tab === 'rules' && <RulesTab draft={draft} update={update} error={error} />}
          {tab === 'departments' && <DepartmentsTab draft={draft} update={update} />}
          {saved?.updatedAt && (
            <p className="muted settings-meta">
              Last saved {new Date(saved.updatedAt).toLocaleString()} {saved.updatedBy && saved.updatedBy !== 'seed' ? `by ${saved.updatedBy}` : ''}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="card settings-section">
      <header className="settings-section__head">
        <h2 className="card__title">{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function TextField({ label, value, onChange, error, hint, ...props }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className={`input${error ? ' is-invalid' : ''}`}>
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props} />
      </span>
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const errorFor = (error, field) => (error?.field === field ? error.message : null);

function GeneralTab({ draft, update, error }) {
  const { company, schedule } = draft;
  // Browsers list some zones under older names (Asia/Calcutta for Asia/Kolkata),
  // so make sure the saved zone is always an option.
  const zones = TIME_ZONES.includes(schedule.timezone) ? TIME_ZONES : [schedule.timezone, ...TIME_ZONES];
  return (
    <>
      <Section title="Company Information" subtitle="Basic information about your organization">
        <div className="company-grid">
          <LogoUploader />
          <div className="form-grid">
            <TextField label="Company Name" value={company.name} onChange={(v) => update('company', { name: v })} error={errorFor(error, 'company.name')} />
            <TextField label="Email" type="email" value={company.email} onChange={(v) => update('company', { email: v })} />
            <TextField label="Phone Number" type="tel" value={company.phone} onChange={(v) => update('company', { phone: v })} />
            <label className="field">
              <span className="field__label">Time Zone</span>
              <span className="select select--icon">
                <Globe className="select__icon" aria-hidden="true" />
                <select value={schedule.timezone} onChange={(e) => update('schedule', { timezone: e.target.value })}>
                  {zones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </span>
              <span className="field-hint">Work dates, late status and all times use this zone.</span>
            </label>
            <label className="field form-grid__full">
              <span className="field__label">Address</span>
              <textarea className="textarea" rows={2} value={company.address} onChange={(e) => update('company', { address: e.target.value })} />
            </label>
          </div>
        </div>
      </Section>
    </>
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Company logo, used by both apps. Uploads straight away (not part of Save Changes). */
function LogoUploader() {
  const { organization, updateOrganization } = useAuth();
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const custom = organization.logoVersion != null;

  async function upload(file) {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('The logo must be 2 MB or smaller.');
      return;
    }
    setBusy(true);
    try {
      const { logoVersion } = await api('/admin/settings/logo', { method: 'PUT', raw: file });
      updateOrganization({ logoVersion });
      toast.success('Logo updated. Employees see it the next time they open the app.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api('/admin/settings/logo', { method: 'DELETE' });
      updateOrganization({ logoVersion: null });
      toast.success('Logo removed. Both apps use the GeoClockIN logo again.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="company-logo">
      <span className="company-logo__preview">
        <CompanyLogo width="132" height="104" alt="Company logo" />
      </span>
      <div className="company-logo__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => inputRef.current.click()} disabled={busy}>
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <ImageUp aria-hidden="true" />} Change Logo
        </button>
        {custom && (
          <button type="button" className="btn btn--danger btn--sm" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      <p className="muted company-logo__hint">PNG, JPG, WebP or SVG, up to 2 MB. Square or wide logos work best. Shown in both apps.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function OfficeTab({ draft, update, error }) {
  const { office } = draft;
  return (
    <div className="office-layout">
      <Section title="Office Location" subtitle="Employees can only clock in and out inside this geofence.">
        <MapPicker
          latitude={office.latitude}
          longitude={office.longitude}
          radius={office.radiusMeters}
          onChange={(coords) => update('office', coords)}
          onAddress={(address) => update('office', { address })}
        />
      </Section>

      <div className="office-side">
        <Section title="Geofence">
          <div className="stack">
            <TextField label="Office Name" value={office.name} onChange={(v) => update('office', { name: v })} error={errorFor(error, 'office.name')} />
            <label className="field">
              <span className="field__label">Address</span>
              <textarea className="textarea" rows={3} value={office.address} onChange={(e) => update('office', { address: e.target.value })} />
            </label>
            <div className="form-grid">
              <TextField
                label="Latitude"
                type="number"
                step="0.000001"
                value={office.latitude}
                onChange={(v) => update('office', { latitude: v === '' ? '' : Number(v) })}
                error={errorFor(error, 'office.latitude')}
              />
              <TextField
                label="Longitude"
                type="number"
                step="0.000001"
                value={office.longitude}
                onChange={(v) => update('office', { longitude: v === '' ? '' : Number(v) })}
                error={errorFor(error, 'office.longitude')}
              />
            </div>
            <Slider
              label="Geofence Radius"
              value={office.radiusMeters}
              min={10}
              max={1000}
              step={5}
              unit="m"
              onChange={(v) => update('office', { radiusMeters: v })}
              hint="Employees must be within this distance of the pin."
              error={errorFor(error, 'office.radiusMeters')}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange, hint, error }) {
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <label className="field">
      <span className="field__label slider-label">
        {label}
        <span className="slider-value">
          <input
            type="number"
            min={min}
            max={5000}
            value={value}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            aria-label={`${label} in ${unit}`}
          />
          {unit}
        </span>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, value || min)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${pct}%` }}
        aria-label={label}
      />
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function RulesTab({ draft, update, error }) {
  const { schedule } = draft;
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const toggleDay = (d) =>
    update('schedule', {
      workdays: schedule.workdays.includes(d) ? schedule.workdays.filter((x) => x !== d) : [...schedule.workdays, d].sort(),
    });

  return (
    <>
      <Section title="Working Hours" subtitle="Used to mark late arrivals and absences.">
        <div className="form-grid form-grid--3">
          <TextField
            label="Work Starts"
            type="time"
            value={schedule.workStart}
            onChange={(v) => update('schedule', { workStart: v })}
            error={errorFor(error, 'schedule.workStart')}
          />
          <TextField
            label="Work Ends"
            type="time"
            value={schedule.workEnd}
            onChange={(v) => update('schedule', { workEnd: v })}
            error={errorFor(error, 'schedule.workEnd')}
          />
          <TextField
            label="Grace Period (minutes)"
            type="number"
            min={0}
            max={240}
            value={schedule.graceMinutes}
            onChange={(v) => update('schedule', { graceMinutes: v === '' ? '' : Number(v) })}
            error={errorFor(error, 'schedule.graceMinutes')}
          />
        </div>
        {schedule.workStart && schedule.workEnd && (
          <p className="muted rules-summary">
            Check-ins after <strong>{formatClock(addMinutes(schedule.workStart, Number(schedule.graceMinutes) || 0))}</strong> are marked late.
            A workday without a check-in counts as absent after <strong>{formatClock(schedule.workEnd)}</strong>.
          </p>
        )}
      </Section>

      <Section title="Workdays" subtitle="Days employees are expected at the office.">
        <div className="day-toggles" role="group" aria-label="Workdays">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              className={`day-toggle${schedule.workdays.includes(d) ? ' is-on' : ''}`}
              aria-pressed={schedule.workdays.includes(d)}
              onClick={() => toggleDay(d)}
            >
              {WEEKDAYS[d]}
            </button>
          ))}
        </div>
        {errorFor(error, 'schedule.workdays') && <p className="field-error">{errorFor(error, 'schedule.workdays')}</p>}
        <div className="form-grid">
          <TextField
            label="Tracking Start Date"
            type="date"
            value={schedule.trackingStartDate}
            onChange={(v) => update('schedule', { trackingStartDate: v })}
            hint="No absences are counted before this date (e.g. your go-live date)."
            error={errorFor(error, 'schedule.trackingStartDate')}
          />
        </div>
      </Section>

      <Section title="Holidays" subtitle="Company holidays are not counted as absences.">
        <form
          className="holiday-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!holiday.date) return;
            update('schedule', { holidays: [...schedule.holidays.filter((h) => h.date !== holiday.date), holiday].sort((a, b) => a.date.localeCompare(b.date)) });
            setHoliday({ date: '', name: '' });
          }}
        >
          <span className="input">
            <CalendarDays aria-hidden="true" />
            <input type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} aria-label="Holiday date" required />
          </span>
          <span className="input">
            <input value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} placeholder="Holiday name (optional)" maxLength={80} aria-label="Holiday name" />
          </span>
          <button type="submit" className="btn btn--secondary" disabled={!holiday.date}>
            <Plus aria-hidden="true" /> Add Holiday
          </button>
        </form>
        {schedule.holidays.length === 0 ? (
          <p className="muted">No holidays added.</p>
        ) : (
          <ul className="list-rows">
            {schedule.holidays.map((h) => (
              <li key={h.date}>
                <span className="list-rows__main">
                  <strong>{formatDate(h.date)}</strong>
                  <span className="muted">{h.name || 'Holiday'}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  onClick={() => update('schedule', { holidays: schedule.holidays.filter((x) => x.date !== h.date) })}
                  aria-label={`Remove holiday on ${formatDate(h.date)}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function DepartmentsTab({ draft, update }) {
  const employees = useApi('/admin/employees');
  const [name, setName] = useState('');
  const counts = useMemo(() => {
    const map = new Map();
    for (const e of employees.data?.employees ?? []) map.set(e.department, (map.get(e.department) ?? 0) + 1);
    return map;
  }, [employees.data]);
  const list = draft.departments;

  return (
    <Section title="Departments" subtitle="Used for filters and reports. Employees keep their department text if it is removed here.">
      <form
        className="holiday-form"
        onSubmit={(e) => {
          e.preventDefault();
          const value = name.trim();
          if (!value || list.includes(value)) return;
          update('departments', [...list, value]);
          setName('');
        }}
      >
        <span className="input">
          <Building2 aria-hidden="true" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department name" maxLength={60} aria-label="New department name" />
        </span>
        <button type="submit" className="btn btn--secondary" disabled={!name.trim() || list.includes(name.trim())}>
          <Plus aria-hidden="true" /> Add Department
        </button>
      </form>
      <ul className="list-rows">
        {list.map((d, i) => (
          <li key={d}>
            <span className="input list-rows__input">
              <input
                defaultValue={d}
                aria-label={`Rename ${d}`}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== d && !list.includes(value)) update('departments', list.map((x, j) => (j === i ? value : x)));
                  else e.target.value = d;
                }}
              />
            </span>
            <span className="muted list-rows__count">
              {counts.get(d) ?? 0} employee{counts.get(d) === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              onClick={() => update('departments', list.filter((x) => x !== d))}
              aria-label={`Remove ${d}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AccountTab() {
  const { admin, updateAdmin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: admin.name, email: admin.email, currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    if (form.newPassword && form.newPassword !== form.confirm) {
      setError({ field: 'confirm', message: 'The new passwords don’t match.' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { admin: updated } = await api('/admin/auth/account', {
        method: 'PUT',
        body: { name: form.name, email: form.email, currentPassword: form.currentPassword, newPassword: form.newPassword || undefined },
      });
      updateAdmin(updated);
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirm: '' }));
      toast.success('Account updated.');
    } catch (e) {
      setError({ field: e.data?.field, message: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="route-enter" onSubmit={submit} noValidate>
      <Section title="Your Account" subtitle="The admin account you are signed in with.">
        <div className="form-grid">
          <TextField label="Name" value={form.name} onChange={set('name')} autoComplete="name" />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={errorFor(error, 'email')} autoComplete="username" />
        </div>
      </Section>
      <Section title="Change Password" subtitle="Leave the new password empty to keep your current one.">
        <div className="form-grid form-grid--3">
          <TextField label="New Password" type="password" value={form.newPassword} onChange={set('newPassword')} error={errorFor(error, 'newPassword')} hint="At least 8 characters." autoComplete="new-password" />
          <TextField label="Confirm New Password" type="password" value={form.confirm} onChange={set('confirm')} error={errorFor(error, 'confirm')} autoComplete="new-password" />
        </div>
      </Section>
      <Section title="Confirm Changes">
        <div className="form-grid">
          <TextField
            label="Current Password"
            type="password"
            value={form.currentPassword}
            onChange={set('currentPassword')}
            error={errorFor(error, 'currentPassword')}
            hint="Required to save any account change."
            autoComplete="current-password"
          />
        </div>
        {error && !error.field && (
          <p className="notice notice--error" role="alert">
            {error.message}
          </p>
        )}
        <div className="section-actions">
          <button type="submit" className="btn btn--primary" disabled={saving || !form.currentPassword}>
            {saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <UserRound aria-hidden="true" />} Update Account
          </button>
        </div>
      </Section>
    </form>
  );
}
