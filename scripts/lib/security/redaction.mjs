const REDACTED = '[REDACTED]';
const UNSERIALIZABLE = '[REDACTED_UNSERIALIZABLE]';
const CIRCULAR = '[REDACTED_CIRCULAR]';

const SENSITIVE_KEYS = new Set([
  'apikey', 'accesstoken', 'refreshtoken', 'authorization', 'proxyauthorization',
  'bearer', 'token', 'secret', 'password', 'passwd', 'cookie', 'setcookie',
  'privatekey', 'connectionstring', 'clientsecret', 'webhooksecret', 'credential'
]);

const SECRET_ENV_KEY = /(?:api[_-]?key|token|secret|password|credential|cookie|private[_-]?key|authorization)/i;

function normalizeKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitiveKey(key) {
  const normalized = normalizeKey(key);
  if (normalized === 'credentials' || normalized === 'headers') return false;
  return SENSITIVE_KEYS.has(normalized)
    || /(apikey|token|secret|password|passwd|cookie|privatekey|connectionstring|credential|authorization)/i.test(normalized);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function configuredSecrets(options = {}) {
  return [...new Set((options.secrets || [])
    .filter((secret) => typeof secret === 'string' && secret.length > 0))]
    .sort((left, right) => right.length - left.length);
}

export function secretValuesFromEnv(env = process.env) {
  return Object.entries(env || {})
    .filter(([key, value]) => SECRET_ENV_KEY.test(key) && typeof value === 'string' && value.length > 0)
    .map(([, value]) => value)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => right.length - left.length);
}

function replaceConfiguredSecrets(text, options) {
  return configuredSecrets(options).reduce((result, secret) => {
    if (secret === REDACTED) return result;
    return result.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
  }, text);
}

export function redactText(value, options = {}) {
  let text;
  try {
    text = String(value);
  } catch {
    return UNSERIALIZABLE;
  }

  let result = replaceConfiguredSecrets(text, options);
  result = result.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi,
    REDACTED
  );
  result = result.replace(/(\b(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic|token)\s+)[^\s,;]+/gi, `$1${REDACTED}`);
  result = result.replace(/(\b(?:cookie|set-cookie)\s*:\s*)[^\r\n]+/gi, `$1${REDACTED}`);
  result = result.replace(/\b(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{16,}/gi, (match) => `${match.split(/\s+/, 1)[0]} ${REDACTED}`);
  result = result.replace(/\b(?:sk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]{8,}\b/g, REDACTED);
  result = result.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED);
  result = result.replace(/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, REDACTED);
  result = result.replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, REDACTED);
  result = result.replace(/(\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)\s*[:=]\s*["']?)[^,\s}\]"']+/gi, `$1${REDACTED}`);
  result = result.replace(/([?&](?:token|access_token|refresh_token|api_key|apikey|secret|password|authorization|key)=)[^&#\s]+/gi, `$1${REDACTED}`);
  result = result.replace(/\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi, `$1${REDACTED}$3`);
  result = result.replace(/\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*\s*=\s*[^\s]+/g, (match) => `${match.split('=', 1)[0]}=${REDACTED}`);
  return result;
}

export function safeRedactText(value, options = {}) {
  try {
    const result = redactText(value, options);
    return typeof result === 'string' ? result : UNSERIALIZABLE;
  } catch {
    return UNSERIALIZABLE;
  }
}

function redactError(error, options, seen) {
  const output = {
    name: redactText(error?.name || 'Error', options),
    message: redactText(error?.message || '', options),
    stack: redactText(error?.stack || '', options)
  };
  for (const key of Object.keys(error || {})) {
    if (isSensitiveKey(key)) output[key] = REDACTED;
    else output[key] = redactAny(error[key], options, seen, key);
  }
  return output;
}

function redactAny(value, options, seen, keyHint) {
  if (isSensitiveKey(keyHint)) return REDACTED;
  if (typeof value === 'string') return redactText(value, options);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function' || typeof value === 'undefined') return UNSERIALIZABLE;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);
  try {
    if (value instanceof Error) return redactError(value, options, seen);
    if (Array.isArray(value)) return value.map((item) => redactAny(item, options, seen));
    const output = {};
    for (const key of Object.keys(value)) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED;
        continue;
      }
      try {
        output[key] = redactAny(value[key], options, seen, key);
      } catch {
        output[key] = UNSERIALIZABLE;
      }
    }
    return output;
  } catch {
    return UNSERIALIZABLE;
  } finally {
    seen.delete(value);
  }
}

export function redactValue(value, options = {}) {
  return redactAny(value, options, new WeakSet());
}

export function safeSerialize(value, options = {}) {
  try {
    const serialized = JSON.stringify(redactValue(value, options));
    return typeof serialized === 'string' ? serialized : JSON.stringify(UNSERIALIZABLE);
  } catch {
    return JSON.stringify(UNSERIALIZABLE);
  }
}

export { CIRCULAR, REDACTED, UNSERIALIZABLE };
