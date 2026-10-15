/** Range of dates the app accepts for events (inclusive). */
export const MIN_DATE = '2026-01-01'
export const MAX_DATE = '2035-12-31'
export const MIN_AT = new Date(`${MIN_DATE}T00:00:00`).getTime()
export const MAX_AT = new Date(`${MAX_DATE}T23:59:59.999`).getTime()
export const MAX_LABEL = 'December 2035'
export const BOUNDS_LABEL = `January 2026 and ${MAX_LABEL}`
