import { STATE_SCHEMA } from "../../packages/core/state-schema.js";

export const appState = {
  ...STATE_SCHEMA,
  t: (key, fallback = "") => fallback,
  dict: {},
  placeNameAr: null,
  placeNameEn: null,
  countdownTimer: null,
  settings: {
    timezoneMinutes: 0,
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0
  },
  refs: {},
  progressDialController: null
};
