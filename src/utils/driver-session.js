import Env from 'react-native-config';
import { getArray, getInt, getString, setArray, setInt } from '../hooks/use-storage';

// The backend and the dashboard both key off these exact strings.
export const SHIFT_EVENT = {
    START: 'sign_in',
    END: 'sign_out',
};

export const SHIFT_ACTIVE_KEY = '_shift_active';

const QUEUE_KEY = '_driver_session_queue';
const QUEUE_LENGTH_KEY = '_driver_session_queue_length';

// Set at runtime (via instance link or storage) so the shared token can be
// rotated or switched on without shipping a new build; the env value is only
// the fallback baked in at build time.
const TOKEN_KEY = '_driver_session_token';

const REQUEST_TIMEOUT_MS = 15000;

/**
 * A failed send that the server will never accept, however many times we try.
 * Kept distinct from a transient failure so the queue can drop it instead of
 * retrying it forever.
 */
class SessionRequestError extends Error {
    constructor(message, { status = null, permanent = false } = {}) {
        super(message);
        this.name = 'SessionRequestError';
        this.status = status;
        this.permanent = permanent;
    }
}

// 408 and 429 are 4xx but say "try again", not "your payload is wrong", so
// they stay retryable.
const isPermanentStatus = (status) => status >= 400 && status < 500 && status !== 408 && status !== 429;

const toHex = (byte) => byte.toString(16).padStart(2, '0');

/**
 * RFC 4122 v4 id, generated once when the driver taps and then carried through
 * every retry of that event. Hermes has no crypto.randomUUID, but
 * react-native-get-random-values polyfills getRandomValues at app entry.
 */
export const createEventId = () => {
    let bytes;

    try {
        bytes = crypto.getRandomValues(new Uint8Array(16));
    } catch (err) {
        // An id we can still deduplicate on beats no event at all.
        bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i += 1) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, toHex).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const getSessionToken = () => {
    try {
        return getString(TOKEN_KEY) || Env.DRIVER_SESSION_TOKEN || null;
    } catch (err) {
        return Env.DRIVER_SESSION_TOKEN || null;
    }
};

/**
 * Builds the payload at the moment the driver acts. The timestamp and the
 * event id are both captured here rather than at send time: a queued event
 * still reports when the driver actually tapped, and every retry carries the
 * same id, so a request that timed out after the server stored it is
 * recognised as a duplicate instead of creating a second shift record.
 */
export const buildSessionEvent = ({ driverId, event, coords }) => {
    const payload = {
        driver_id: driverId,
        event,
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
    };

    if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
        payload.latitude = coords.latitude;
        payload.longitude = coords.longitude;

        if (typeof coords.accuracy === 'number') {
            payload.accuracy_meters = coords.accuracy;
        }
    }

    return payload;
};

const postSessionEvent = async (baseUrl, payload) => {
    if (!baseUrl) {
        throw new Error('No backend URL configured for driver session events.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const token = getSessionToken();

    try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/drivers/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const body = await response.json().catch(() => ({}));

        // The server telling us it already has this event id means our event is
        // stored. That is a success however it is reported, so check it before
        // the status.
        if (body?.duplicate === true) {
            return body;
        }

        if (!response.ok) {
            throw new SessionRequestError(`Driver session request failed with ${response.status}`, {
                status: response.status,
                permanent: isPermanentStatus(response.status),
            });
        }

        return body;
    } finally {
        clearTimeout(timeout);
    }
};

/**
 * Written alongside the queue itself, so we can tell an empty queue apart from
 * one we simply failed to read.
 */
const expectedQueueLength = () => {
    try {
        return getInt(QUEUE_LENGTH_KEY) ?? 0;
    } catch (err) {
        return 0;
    }
};

/**
 * Returns the queued events, or null when the store could not be read.
 *
 * The distinction matters: storage answers null both for an absent key and for
 * a store that isn't readable, and treating the latter as "empty" lets the next
 * append replace every stored event with a single one.
 */
const readQueue = () => {
    try {
        const queued = getArray(QUEUE_KEY);

        if (Array.isArray(queued)) {
            return queued;
        }

        // An absent key and an unreadable store look identical here, so fall
        // back to the marker: a non-zero length with no array means the read
        // failed rather than that nothing is queued.
        return expectedQueueLength() > 0 ? null : [];
    } catch (err) {
        return null;
    }
};

const writeQueue = (events) => {
    try {
        setArray(QUEUE_KEY, events);
        setInt(QUEUE_LENGTH_KEY, events.length);
    } catch (err) {
        console.warn('Unable to persist driver session queue:', err);
    }
};

/**
 * Appends an event, unless the existing queue can't be read -- in which case
 * writing would replace every stored event with this one. Losing a single
 * event is bad; silently wiping a driver's whole shift history is worse.
 */
export const queueSessionEvent = (payload) => {
    const existing = readQueue();

    if (existing === null) {
        console.warn('Driver session queue unreadable; refusing to overwrite stored events.');
        return false;
    }

    writeQueue([...existing, payload]);

    return true;
};

export const getQueuedSessionEventCount = () => readQueue()?.length ?? expectedQueueLength();

/**
 * Sends the event, queueing it for a later retry if it doesn't get through.
 * Never throws: a failed send must not stop the driver starting or ending a
 * shift, and must not lose the event either -- unless the server has told us
 * the event is unacceptable, in which case queueing it would retry it forever.
 */
export const sendSessionEvent = async (baseUrl, payload) => {
    try {
        const body = await postSessionEvent(baseUrl, payload);
        return { delivered: true, duplicate: body?.duplicate === true };
    } catch (err) {
        if (err?.permanent) {
            console.warn(`Driver session event rejected with ${err.status} and dropped:`, payload);
            return { delivered: false, dropped: true, error: err };
        }

        console.warn('Driver session event queued for retry:', err?.message ?? err);
        const stored = queueSessionEvent(payload);

        return { delivered: false, stored, error: err };
    }
};

/**
 * Retries anything queued earlier. Events are kept in order and a temporary
 * failure stops the run, so a shift start is never delivered after its own end.
 * An event the server has permanently rejected is dropped rather than retried,
 * otherwise it would block every event behind it forever.
 */
export const flushSessionQueue = async (baseUrl) => {
    const queued = readQueue();

    if (queued === null) {
        // Unreadable right now. Leave whatever is stored untouched and retry on
        // the next foreground rather than writing over it.
        return { delivered: 0, dropped: 0, remaining: expectedQueueLength() };
    }

    if (queued.length === 0 || !baseUrl) {
        return { delivered: 0, dropped: 0, remaining: queued.length };
    }

    let delivered = 0;
    let dropped = 0;

    // Counts everything taken off the front of the queue, delivered or dropped,
    // so the survivors stay a clean tail slice.
    let processed = 0;

    for (const payload of queued) {
        try {
            await postSessionEvent(baseUrl, payload);
            delivered += 1;
            processed += 1;
        } catch (err) {
            if (err?.permanent) {
                console.warn(`Driver session event rejected with ${err.status} and dropped:`, payload);
                dropped += 1;
                processed += 1;
                continue;
            }

            break;
        }
    }

    const remaining = queued.slice(processed);
    writeQueue(remaining);

    return { delivered, dropped, remaining: remaining.length };
};
