/** Tunables and tag lists. Everything here is data, not behaviour. */

export const PRESET_PACKAGES = ['com.xcr.singleapp.wpay', 'com.xcr.singleapp.certification.sek']

/** Tags written by the app's own code (managed, native, dialog, timing) – a line with one of these belongs to the app. */
export const STRONG_APP_TAGS = new Set([
  'XINFOR',
  'XWARN',
  'XERROR',
  'XDEBUG',
  'XTRACE',
  'LOGF',
  'PAYMENTAPP_DIALOG',
  'TRANS_STEP_TRACE',
  'PaxSmartDevice',
  'PAX_KEY_INJECTION',
  'CloudBanking.DroidCommon.BootReceiver',
])

export const MANAGED_TAGS = new Set(['XINFOR', 'XWARN', 'XERROR', 'XDEBUG', 'XTRACE'])
export const NATIVE_TAG = 'LOGF'
export const DIALOG_TAG = 'PAYMENTAPP_DIALOG'
export const STEP_TRACE_TAG = 'TRANS_STEP_TRACE'
export const SDK_TAGS = new Set(['PaxSmartDevice', 'Neptune', 'PAXCARD', 'IPP_DAL_TAG', 'DLOG', 'PAX_KEY_INJECTION', 'POSSDKCLIENT_LOG'])
export const SYSTEM_TAGS = new Set(['ActivityManager', 'ActivityTaskManager', 'lowmemorykiller', 'AndroidRuntime'])

export const ECHO_PREFIX = 'PC-EFTPOS TX payload (App->POS) ASCII: Z0.'

export const SEGMENT = {
  /** A backwards jump larger than this (ms) starts a new segment… */
  timeJumpMs: 300_000,
  /** …when the next N lines stay behind the previous maximum as well. */
  sustainLines: 4,
  /** Segments with fewer lines are merged into the following one. */
  minLines: 50,
  /** A segment whose first timestamp is within this many ms of midnight is flagged as "clock unset". */
  clockUnsetWindowMs: 120_000,
}

export const TXN = {
  /** `FUNCTION=` lines within this window before a `transaction start` mark it as ECR-initiated. */
  ecrWindowMs: 60_000,
  /** A step trace attaches to a transaction that ended within this window. */
  stepTraceWindowMs: 5_000,
}

export const INCIDENT = {
  /** Incidents of the same pid within this window are linked together. */
  linkWindowMs: 2_000,
}
