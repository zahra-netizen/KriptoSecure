import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Copy, Download, CheckCircle2, Shield, Lock, Binary } from "lucide-react";
import type { KeyData } from "@/lib/crypto";
import { encryptData, decryptData } from "@/lib/crypto";

interface CoreFunctionProps {
  keys: KeyData | null;
}

interface TraceStep {
  text: string;
  phase: "rsa" | "fibonacci" | "permutation" | "done";
}

function classifyTrace(text: string): TraceStep["phase"] {
  if (text.includes("RSA")) return "rsa";
  if (text.includes("Fibonacci") || text.includes("Keystream")) return "fibonacci";
  if (text.includes("Permutasi")) return "permutation";
  return "done";
}

const phaseIcons = {
  rsa: Lock,
  fibonacci: Binary,
  permutation: Shield,
  done: CheckCircle2,
};

const phaseColors = {
  rsa: "text-primary",
  fibonacci: "text-accent",
  permutation: "text-primary",
  done: "text-success",
};

const CoreFunction = ({ keys }: CoreFunctionProps) => {
  const [mode, setMode] = useState<"encrypt" | "decrypt">("encrypt");
  const [inputType, setInputType] = useState<"text" | "file">("text");
  const [textInput, setTextInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [originalExt, setOriginalExt] = useState("");
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [resultText, setResultText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [traceActive, setTraceActive] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const addTrace = useCallback((step: string) => {
    setTraceSteps((prev) => [...prev, { text: step, phase: classifyTrace(step) }]);
  }, []);

  const processData = useCallback(async () => {
    if (!keys) return;
    setProcessing(true);
    setFinished(false);
    setTraceSteps([]);
    setTraceActive(true);
    setResultBytes(null);
    setResultText("");

    const isEncrypt = mode === "encrypt";
    let inputBytes: Uint8Array;

    if (inputType === "text") {
      if (isEncrypt) {
        inputBytes = new TextEncoder().encode(textInput);
      } else {
        // For text decryption, expect comma-separated bytes
        try {
          const arr = textInput.split(",").map((s) => parseInt(s.trim()));
          inputBytes = new Uint8Array(arr);
        } catch {
          setResultText("Format input dekripsi tidak valid.");
          setProcessing(false);
          return;
        }
      }
    } else {
      if (!fileData) {
        setProcessing(false);
        return;
      }
      inputBytes = fileData;
    }

    try {
      const output = isEncrypt
        ? await encryptData(inputBytes, keys, addTrace)
        : await decryptData(inputBytes, keys, addTrace);

      setResultBytes(output);

      if (inputType === "text") {
        if (isEncrypt) {
          setResultText(Array.from(output).join(","));
        } else {
          try {
            setResultText(new TextDecoder().decode(output));
          } catch {
            setResultText(Array.from(output).join(","));
          }
        }
      }

      setFinished(true);
    } catch (err) {
      setResultText("Terjadi kesalahan saat memproses data.");
    }

    setProcessing(false);
  }, [keys, mode, inputType, textInput, fileData, addTrace]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setFileName(file.name);
      const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : "";
      setOriginalExt(ext);
      file.arrayBuffer().then((buf) => setFileData(new Uint8Array(buf)));
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : "";
      setOriginalExt(ext);
      file.arrayBuffer().then((buf) => setFileData(new Uint8Array(buf)));
    }
  }, []);

  const copyResult = useCallback(() => {
    navigator.clipboard.writeText(resultText);
  }, [resultText]);

  const downloadResult = useCallback(() => {
    if (!resultBytes) return;
    const isEncrypt = mode === "encrypt";
    const blob = new Blob([resultBytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isEncrypt
      ? `encrypted${originalExt || ".bin"}.enc`
      : `decrypted${originalExt || ".bin"}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resultBytes, mode, originalExt]);

  // Active phases for timeline
  const activePhases = traceSteps.map((s) => s.phase);
  const timelinePhases: { key: TraceStep["phase"]; label: string }[] = [
    { key: "rsa", label: "RSA Block" },
    { key: "fibonacci", label: "Fibonacci Keystream" },
    { key: "permutation", label: "Bit Permutation" },
  ];

  return (
    <section className="pb-16 px-4">
      <div className="container max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-lg border border-border bg-card p-6 md:p-8"
        >
          <h2 className="font-heading text-lg font-semibold text-foreground mb-6">
            {mode === "encrypt" ? "Enkripsi" : "Dekripsi"}
          </h2>

          {/* Mode Toggle */}
          <div className="flex mb-6 rounded-md border border-border overflow-hidden w-fit">
            {(["encrypt", "decrypt"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setResultBytes(null);
                  setResultText("");
                  setTraceSteps([]);
                  setTraceActive(false);
                  setFinished(false);
                }}
                className={`px-5 py-2 font-body text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "encrypt" ? "Enkripsi" : "Dekripsi"}
              </button>
            ))}
          </div>

          {/* Input Type Toggle */}
          <div className="flex gap-4 mb-4">
            {(["text", "file"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setInputType(t)}
                className={`font-heading text-xs tracking-wide uppercase transition-colors ${
                  inputType === t ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "text" ? "Teks" : "File"}
              </button>
            ))}
          </div>

          {/* Input Area */}
          {inputType === "text" ? (
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Masukkan pesan di sini..."
              rows={5}
              className="w-full rounded-md border border-border bg-secondary px-4 py-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none mb-6"
            />
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              className={`rounded-md border-2 border-dashed px-6 py-12 text-center transition-colors mb-6 ${
                isDragOver ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Upload className="mx-auto mb-3 text-muted-foreground" size={28} />
              <p className="font-body text-sm text-muted-foreground mb-1">
                {fileName || "Seret berkas ke sini"}
              </p>
              <p className="font-body text-xs text-muted-foreground/60 mb-3">
                Mendukung semua jenis file — data binary diproses utuh
              </p>
              <input type="file" onChange={handleFileSelect} className="hidden" id="file-input" />
              <label
                htmlFor="file-input"
                className="inline-block cursor-pointer font-body text-xs text-primary hover:underline"
              >
                Pilih Berkas
              </label>
            </div>
          )}

          {/* Process Button */}
          <button
            onClick={processData}
            disabled={processing || !keys}
            className={`rounded-md px-6 py-3 font-body text-sm font-semibold transition-all ${
              processing
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98]"
            }`}
          >
            {processing ? "Memproses..." : "Proses Sekarang"}
          </button>

          {!keys && (
            <p className="mt-2 font-body text-xs text-muted-foreground">
              Harap bangkitkan kunci terlebih dahulu.
            </p>
          )}

          {/* Process Timeline */}
          <AnimatePresence>
            {traceActive && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6"
              >
                {/* Timeline phases */}
                <div className="flex items-center gap-0 mb-5">
                  {timelinePhases.map((phase, i) => {
                    const isActive = activePhases.includes(phase.key);
                    const isDone = finished || activePhases.indexOf(phase.key) < activePhases.length - 1;
                    const Icon = phaseIcons[phase.key];

                    return (
                      <div key={phase.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                          <motion.div
                            animate={{
                              scale: isActive ? 1 : 0.85,
                              opacity: isActive ? 1 : 0.4,
                            }}
                            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isDone && isActive
                                ? "border-success bg-success/10"
                                : isActive
                                ? "border-primary bg-primary/10"
                                : "border-border bg-secondary"
                            }`}
                          >
                            <Icon
                              size={18}
                              className={
                                isDone && isActive
                                  ? "text-success"
                                  : isActive
                                  ? phaseColors[phase.key]
                                  : "text-muted-foreground"
                              }
                            />
                          </motion.div>
                          <span className={`mt-2 font-heading text-[10px] text-center ${
                            isActive ? "text-foreground" : "text-muted-foreground"
                          }`}>
                            {phase.label}
                          </span>
                        </div>
                        {i < timelinePhases.length - 1 && (
                          <div className={`h-0.5 flex-1 -mt-5 transition-colors ${
                            activePhases.includes(timelinePhases[i + 1].key)
                              ? "bg-primary"
                              : "bg-border"
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Trace log */}
                <div className={`rounded-md border p-4 transition-all glassmorphism ${
                  processing ? "trace-glow border-primary" : "border-border"
                }`}>
                  <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Jejak Proses
                  </h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {traceSteps.map((step, i) => (
                      <motion.p
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`font-heading text-xs ${
                          step.text.startsWith("✓") ? "text-success font-semibold" : "text-foreground"
                        }`}
                      >
                        {step.text}
                      </motion.p>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success + Result */}
          <AnimatePresence>
            {finished && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-6"
              >
                {/* Success banner */}
                <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 flex items-center gap-3 mb-4">
                  <CheckCircle2 className="text-success shrink-0" size={22} />
                  <div>
                    <p className="font-body text-sm font-semibold text-success">
                      {mode === "encrypt" ? "Enkripsi Berhasil!" : "Dekripsi Berhasil!"}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      Keamanan Optimal — Data diproses melalui 3 lapisan kriptografi
                    </p>
                  </div>
                </div>

                {/* Text result */}
                {inputType === "text" && resultText && (
                  <div className="mb-4">
                    <label className="block font-heading text-xs text-muted-foreground mb-2">Hasil</label>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={resultText}
                        rows={4}
                        className="w-full rounded-md border border-border bg-secondary px-4 py-3 font-heading text-xs text-foreground resize-none"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button onClick={copyResult} className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors" title="Salin">
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Download button */}
                {resultBytes && resultBytes.length > 0 && (
                  <button
                    onClick={downloadResult}
                    className="w-full rounded-md border-2 border-accent bg-accent/10 px-6 py-4 font-body text-sm font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.99] download-glow flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    {mode === "encrypt" ? "Unduh Berkas Terenkripsi" : "Unduh Berkas Terdekripsi"}
                    {originalExt && mode === "decrypt" && (
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        ({originalExt})
                      </span>
                    )}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
};

export default CoreFunction;
