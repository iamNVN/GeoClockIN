// The employee app is served at / in production; locally it runs on its own dev server.
export const EMPLOYEE_APP_URL = import.meta.env.VITE_EMPLOYEE_APP_URL ?? (import.meta.env.DEV ? 'http://localhost:5173/' : '/');

/** Absolute address of a page of the employee app, e.g. employeeAppLink('display'). */
export const employeeAppLink = (path = '') => new URL(path, new URL(EMPLOYEE_APP_URL, window.location.origin)).href;
