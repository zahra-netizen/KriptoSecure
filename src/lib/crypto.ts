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

function permuteBits(byte: number): number {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    result |= ((byte >> i) & 1) << (7 - i);
  }
  return result;
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
  onTrace: TraceCallback
): Promise<Uint8Array> {
  const n = BigInt(keys.n);
  const e = BigInt(keys.e);
  const k = keys.k;

  onTrace("Proses RSA Block Encryption...");
  await delay(400);

  // Each byte m → m^e mod n → k bytes
  const rsaBlocks: number[] = [];
  for (let i = 0; i < inputBytes.length; i++) {
    const m = BigInt(inputBytes[i]);
    const cipher = modPow(m, e, n);
    rsaBlocks.push(...bigintToBytes(cipher, k));
  }

  onTrace(`  → Enkripsi RSA selesai (${inputBytes.length} byte → ${rsaBlocks.length} byte, block size k=${k})`);
  await delay(300);

  onTrace("Pembangkitan Keystream Fibonacci...");
  await delay(400);

  const keystream = fibonacciKeystream(rsaBlocks.length);
  const xored = xorWithKeystream(rsaBlocks, keystream);

  onTrace(`  → Keystream Fibonacci diterapkan (${keystream.length} elemen)`);
  await delay(300);

  onTrace("Permutasi Bit...");
  await delay(300);

  const finalBytes = xored.map(permuteBits);

  onTrace("  → Permutasi selesai");
  await delay(200);

  onTrace("✓ Enkripsi selesai.");
  return new Uint8Array(finalBytes);
}

/**
 * Full decryption pipeline: bit unpermute → Fibonacci XOR → RSA block decrypt
 */
export async function decryptData(
  inputBytes: Uint8Array,
  keys: KeyData,
  onTrace: TraceCallback
): Promise<Uint8Array> {
  const n = BigInt(keys.n);
  const d = BigInt(keys.d);
  const k = keys.k;

  onTrace("Reverse Permutasi Bit...");
  await delay(300);

  // Bit reversal is self-inverse
  const unpermuted = Array.from(inputBytes).map(permuteBits);

  onTrace("  → Permutasi dibatalkan");
  await delay(300);

  onTrace("Reverse Keystream Fibonacci...");
  await delay(400);

  const keystream = fibonacciKeystream(unpermuted.length);
  const unxored = xorWithKeystream(unpermuted, keystream);

  onTrace(`  → Keystream Fibonacci dibatalkan (${keystream.length} elemen)`);
  await delay(300);

  onTrace("Proses RSA Block Decryption...");
  await delay(400);

  if (unxored.length % k !== 0) {
    onTrace("⚠ Error: Data tidak sesuai dengan ukuran block RSA");
    return new Uint8Array(0);
  }

  const decryptedBytes: number[] = [];
  for (let i = 0; i < unxored.length; i += k) {
    const block = unxored.slice(i, i + k);
    const cipherVal = bytesToBigint(block);
    const m = modPow(cipherVal, d, n);
    decryptedBytes.push(Number(m & 0xffn));
  }

  onTrace(`  → Dekripsi RSA selesai (${unxored.length} byte → ${decryptedBytes.length} byte)`);
  await delay(200);

  onTrace("✓ Dekripsi selesai.");
  return new Uint8Array(decryptedBytes);
}

/**
 * Generate RSA keys from three primes
 */
export function generateKeys(p1: number, p2: number, p3: number, e?: number): KeyData {
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
