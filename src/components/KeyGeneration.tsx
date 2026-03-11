import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { isPrime, randomPrime, generateKeys } from "@/lib/crypto";
import type { KeyData } from "@/lib/crypto";

interface KeyGenerationProps {
  onKeysGenerated: (keys: KeyData) => void;
}

const KeyGeneration = ({ onKeysGenerated }: KeyGenerationProps) => {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState("");
  const [pubE, setPubE] = useState("");
  const [modN, setModN] = useState("");
  const [privD, setPrivD] = useState("");
  const [blockK, setBlockK] = useState(0);
  const [error, setError] = useState("");

  // Live math preview
  const liveN = useMemo(() => {
    const np1 = parseInt(p1);
    const np2 = parseInt(p2);
    const np3 = parseInt(p3);
    if (np1 > 1 && np2 > 1 && np3 > 1) {
      return (BigInt(np1) * BigInt(np2) * BigInt(np3)).toString();
    }
    return null;
  }, [p1, p2, p3]);

  const autoGenerate = useCallback(() => {
    const prime1 = randomPrime(50, 200);
    let prime2 = randomPrime(50, 200);
    while (prime2 === prime1) prime2 = randomPrime(50, 200);
    let prime3 = randomPrime(50, 200);
    while (prime3 === prime1 || prime3 === prime2) prime3 = randomPrime(50, 200);

    const keys = generateKeys(prime1, prime2, prime3);

    setP1(prime1.toString());
    setP2(prime2.toString());
    setP3(prime3.toString());
    setPubE(keys.e);
    setModN(keys.n);
    setPrivD(keys.d);
    setBlockK(keys.k);
    setError("");
    onKeysGenerated(keys);
  }, [onKeysGenerated]);

  const calculateKeys = useCallback(() => {
    const np1 = parseInt(p1);
    const np2 = parseInt(p2);
    const np3 = parseInt(p3);
    const ne = parseInt(pubE);

    if (!isPrime(np1) || !isPrime(np2) || !isPrime(np3)) {
      setError("Semua nilai harus bilangan prima.");
      return;
    }
    if (np1 === np2 || np1 === np3 || np2 === np3) {
      setError("Semua bilangan prima harus berbeda.");
      return;
    }

    try {
      const keys = generateKeys(np1, np2, np3, ne);
      setModN(keys.n);
      setPrivD(keys.d);
      setBlockK(keys.k);
      setError("");
      onKeysGenerated(keys);
    } catch {
      setError("Kunci publik (e) harus coprime dengan φ(n).");
    }
  }, [p1, p2, p3, pubE, onKeysGenerated]);

  return (
    <section className="pb-12 px-4">
      <div className="container max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-lg border border-border bg-card p-6 md:p-8"
        >
          <h2 className="font-heading text-lg font-semibold text-foreground mb-6">
            Pembangkitan Kunci
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Prima p₁", value: p1, setter: setP1 },
              { label: "Prima p₂", value: p2, setter: setP2 },
              { label: "Prima p₃", value: p3, setter: setP3 },
              { label: "Kunci Publik (e)", value: pubE, setter: setPubE },
            ].map((field) => (
              <div key={field.label}>
                <label className="block font-heading text-xs text-muted-foreground mb-2">
                  {field.label}
                </label>
                <input
                  type="number"
                  value={field.value}
                  onChange={(e) => field.setter(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 font-heading text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  placeholder="..."
                />
              </div>
            ))}
          </div>

          {/* Live Math Preview */}
          {liveN && !modN && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-2"
            >
              <p className="font-heading text-xs text-primary">
                <span className="text-muted-foreground">n = p₁ × p₂ × p₃ = </span>
                {liveN}
              </p>
            </motion.div>
          )}

          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={autoGenerate}
              className="rounded-md bg-primary px-4 py-2 font-body text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Auto-Generate
            </button>
            <button
              onClick={calculateKeys}
              className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground transition-all hover:border-primary hover:text-primary"
            >
              Hitung Kunci
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive mb-4 font-body">{error}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-heading text-xs text-muted-foreground mb-2">
                Modulus (n)
              </label>
              <div className="rounded-md border border-border bg-secondary px-3 py-2 font-heading text-sm text-foreground min-h-[40px] break-all">
                {modN || "—"}
              </div>
            </div>
            <div>
              <label className="block font-heading text-xs text-muted-foreground mb-2">
                Kunci Privat (d)
              </label>
              <div className="rounded-md border border-border bg-secondary px-3 py-2 font-heading text-sm text-foreground min-h-[40px] break-all">
                {privD || "—"}
              </div>
            </div>
            <div>
              <label className="block font-heading text-xs text-muted-foreground mb-2">
                Block Size (k)
              </label>
              <div className="rounded-md border border-border bg-secondary px-3 py-2 font-heading text-sm text-foreground min-h-[40px]">
                {blockK ? `${blockK} byte` : "—"}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export type { KeyData };
export default KeyGeneration;
