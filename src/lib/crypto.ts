// ── Math utilities ──

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) result = (result * base) % mod;
        exp = exp / 2n;
        base = (base * base) % mod;
    }
    return result;
}

export function gcd(a: bigint, b: bigint): bigint {
    while (b > 0n) {
        [a, b] = [b, a % b];
    }
    return a;
}

export function modInverse(e: bigint, phi: bigint): bigint {
    let [old_r, r] = [phi, e];
    let [old_s, s] = [0n, 1n];
    while (r !== 0n) {
        const q = old_r / r;
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
    }
    return ((old_s % phi) + phi) % phi;
}

export function isPrime(n: number): boolean {
    if (n < 2) return false;
    for (let i = 2; i <= Math.sqrt(n); i++) {
        if (n % i === 0) return false;
    }
    return true;
}

export function randomPrime(min: number, max: number): number {
    const primes: number[] = [];
    for (let i = min; i <= max; i++) {
        if (isPrime(i)) primes.push(i);
    }
    return primes[Math.floor(Math.random() * primes.length)];
}

// ── Key types ──

export interface KeyData {
    n: string;
    d: string;
    e: string;
    k: number; // block size in bytes = ceil(n.bit_length / 8)
    p1: number;
    p2: number;
    p3: number;
}

// ── Block-based binary RSA ──

function bigintBitLength(n: bigint): number {
    if (n === 0n) return 0;
    return n.toString(2).length;
}

/** Convert bigint to k-byte big-endian array */
function bigintToBytes(val: bigint, k: number): number[] {
    const bytes: number[] = new Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) {
        bytes[i] = Number(val & 0xffn);
        val >>= 8n;
    }
    return bytes;
}

/** Convert k-byte big-endian array to bigint */
function bytesToBigint(bytes: number[]): bigint {
    let val = 0n;
    for (const b of bytes) {
        val = (val << 8n) | BigInt(b);
    }
    return val;
}

// ── Fibonacci keystream ──

function fibonacciKeystream(length: number, seed1 = 1, seed2 = 1): number[] {
    const stream: number[] = [seed1 % 256, seed2 % 256];
    for (let i = 2; i < length; i++) {
        stream.push((stream[i - 1] + stream[i - 2]) % 256);
    }
    return stream.slice(0, length);
}

function xorWithKeystream(data: number[], keystream: number[]): number[] {
    return data.map((byte, i) => byte ^ keystream[i % keystream.length]);
}

// ── Bit permutation ──

const PERM_MAP = [8, 7, 1, 5, 3, 6, 2, 4];

function applyPermutation(byte: number): number {
    const bits = byte.toString(2).padStart(8, "0").split("");
    const result = new Array(8).fill("0");
    for (let i = 0; i < 8; i++) {
        result[PERM_MAP[i] - 1] = bits[i];
    }
    return parseInt(result.join(""), 2);
}

function applyInversePermutation(byte: number): number {
    const bits = byte.toString(2).padStart(8, "0").split("");
    const original = new Array(8).fill("0");
    for (let i = 0; i < 8; i++) {
        original[i] = bits[PERM_MAP[i] - 1];
    }
    return parseInt(original.join(""), 2);
}

export type TraceCallback = (step: string) => void;

export interface ProcessResult {
    data: Uint8Array;
    displayText?: string;
}

/**
 * Full encryption pipeline: RSA block encrypt → Fibonacci XOR → bit permutation
 */
export async function encryptData(
    inputBytes: Uint8Array,
    keys: KeyData,
    onTrace: TraceCallback,
): Promise<Uint8Array> {
    const n = BigInt(keys.n);
    const e = BigInt(keys.e);
    const k = keys.k;

    onTrace("--- Tahap 1: Multi-Prime RSA ---");
    const rsaBytes: number[] = [];
    for (let i = 0; i < inputBytes.length; i++) {
        const m = BigInt(inputBytes[i]);
        const xi = modPow(m, e, n);
        const blocks = bigintToBytes(xi, k);
        rsaBytes.push(...blocks);
        onTrace(
            `Char '${String.fromCharCode(Number(m))}' (${m}) → RSA: ${xi} → Base256: [${blocks.join(", ")}]`,
        );
        await delay(50);
    }

    onTrace("\n--- Tahap 2: Fibonacci Keystream ---");
    const ks = fibonacciKeystream(rsaBytes.length);
    onTrace(`Keystream (n=${ks.length}): ${ks.slice(0, 10).join(", ")}...`);

    onTrace("\n--- Tahap 3: XOR & Permutasi Bit ---");
    const IV = 38;
    let y_prev = IV;
    const finalBytes: number[] = [];
    for (let i = 0; i < rsaBytes.length; i++) {
        const xi = rsaBytes[i];
        const k_r = ks[i];
        const xor_res = (xi ^ y_prev ^ k_r) % 256;
        const yi = applyPermutation(xor_res);
        finalBytes.push(yi);
        onTrace(
            `Byte ${i + 1} | RSA=${xi} | ks=${k_r} | y_prev=${y_prev} | XOR=${xor_res} | Cipher=${yi.toString(2).padStart(8, "0")}`,
        );
        y_prev = yi;
        if (i % 5 === 0) await delay(20);
    }

    onTrace("✓ Enkripsi Selesai.");
    return new Uint8Array(finalBytes);
}

/**
 * Full decryption pipeline matching the specific flowchart logic
 */
export async function decryptData(
    inputBytes: Uint8Array,
    keys: KeyData,
    onTrace: TraceCallback,
): Promise<Uint8Array> {
    const n = BigInt(keys.n);
    const d = BigInt(keys.d);
    const k = keys.k;

    onTrace(
        "--- Tahap 1 & 2: Inverse Permutasi + XOR Fibonacci ---",
    );
    const IV = 38;
    let y_prev = IV;
    const ks = fibonacciKeystream(inputBytes.length);
    const rsaBytes: number[] = [];
    for (let i = 0; i < inputBytes.length; i++) {
        const yi = inputBytes[i];
        const ci = applyInversePermutation(yi);
        const xi = (ci ^ y_prev ^ ks[i]) % 256;
        rsaBytes.push(xi);
        onTrace(
            `Byte ${i + 1}: Cipher(${yi}) → InvPerm: ${ci} ⊕ Prev: ${y_prev} ⊕ Fib: ${ks[i]} = RSA Byte: ${xi}`,
        );
        y_prev = yi;
        if (i % 5 === 0) await delay(20);
    }
    await delay(300);

    onTrace("\n--- Tahap 3: RSA Block Decryption ---");
    const decryptedBytes: number[] = [];
    for (let i = 0; i < rsaBytes.length; i += k) {
        const block = rsaBytes.slice(i, i + k);
        if (block.length < k) break;

        const xi = bytesToBigint(block);
        const m = modPow(xi, d, n);

        decryptedBytes.push(Number(m));
        onTrace(
            `Blok [${block.join(",")}] → Int: ${xi} → RSA Dec: ${m} ('${String.fromCharCode(Number(m))}')`,
        );
        await delay(100);
    }

    onTrace("✓ Dekripsi Selesai: File berhasil dipulihkan.");
    return new Uint8Array(decryptedBytes);
}

/**
 * Generate RSA keys from three primes
 */
export function generateKeys(
    p1: number,
    p2: number,
    p3: number,
    e?: number,
): KeyData {
    const n = BigInt(p1) * BigInt(p2) * BigInt(p3);
    const phi = (BigInt(p1) - 1n) * (BigInt(p2) - 1n) * (BigInt(p3) - 1n);

    let eBig = e ? BigInt(e) : 65537n;
    if (gcd(eBig, phi) !== 1n) {
        eBig = 3n;
        while (eBig < phi && gcd(eBig, phi) !== 1n) eBig += 2n;
    }

    const d = modInverse(eBig, phi);
    const k = Math.ceil(bigintBitLength(n) / 8);

    return {
        n: n.toString(),
        d: d.toString(),
        e: eBig.toString(),
        k,
        p1,
        p2,
        p3,
    };
}

function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}
