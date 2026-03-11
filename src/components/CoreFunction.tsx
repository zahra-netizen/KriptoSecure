import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Upload,
    Copy,
    Check,
    Download,
    CheckCircle2,
    Shield,
    Lock,
    Binary,
    Eye,
} from "lucide-react";
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
    if (text.includes("Fibonacci") || text.includes("Keystream"))
        return "fibonacci";
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

// ── SessionStorage helpers ────────────────────────────────────────────────
function uint8ToBase64(data: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
    return btoa(bin);
}
function base64ToUint8(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
const sessionKey = (m: string) => `cf_file_${m}`;
function saveFileSession(
    m: string,
    name: string,
    ext: string,
    data: Uint8Array,
) {
    try {
        sessionStorage.setItem(
            sessionKey(m),
            JSON.stringify({ name, ext, data: uint8ToBase64(data) }),
        );
    } catch {
        /* quota exceeded — skip silently */
    }
}
function loadFileSession(
    m: string,
): { name: string; ext: string; data: Uint8Array } | null {
    try {
        const raw = sessionStorage.getItem(sessionKey(m));
        if (!raw) return null;
        const { name, ext, data } = JSON.parse(raw) as {
            name: string;
            ext: string;
            data: string;
        };
        return { name, ext, data: base64ToUint8(data) };
    } catch {
        return null;
    }
}
function clearFileSession(m: string) {
    sessionStorage.removeItem(sessionKey(m));
}
// ───────────────────────────────────────────────────────────────────────────

const CoreFunction = ({ keys }: CoreFunctionProps) => {
    const [mode, setMode] = useState<"encrypt" | "decrypt">(
        () =>
            (sessionStorage.getItem("cf_mode") as "encrypt" | "decrypt") ??
            "encrypt",
    );
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
    const [showTrace, setShowTrace] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [copied, setCopied] = useState(false);
    const [inputError, setInputError] = useState<string | null>(null);

    const addTrace = useCallback((step: string) => {
        setTraceSteps((prev) => [
            ...prev,
            { text: step, phase: classifyTrace(step) },
        ]);
    }, []);

    // Restore file from sessionStorage on first mount
    useEffect(() => {
        const savedText = sessionStorage.getItem(`cf_text_${mode}`);
        if (savedText) setTextInput(savedText);
        const saved = loadFileSession(mode);
        if (saved) {
            setFileName(saved.name);
            setOriginalExt(saved.ext);
            setFileData(saved.data);
            setInputType("file");
        }
        // Restore output
        const savedResultText = sessionStorage.getItem(
            `cf_result_text_${mode}`,
        );
        const savedResultBytes = sessionStorage.getItem(
            `cf_result_bytes_${mode}`,
        );
        if (savedResultText || savedResultBytes) {
            if (savedResultText) setResultText(savedResultText);
            if (savedResultBytes)
                setResultBytes(base64ToUint8(savedResultBytes));
            setFinished(true);
        }
        // Restore trace steps
        const savedTrace = sessionStorage.getItem(`cf_trace_${mode}`);
        if (savedTrace) {
            try {
                const parsed = JSON.parse(savedTrace) as TraceStep[];
                if (parsed.length > 0) {
                    setTraceSteps(parsed);
                    setTraceActive(true);
                }
            } catch {
                /* ignore */
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const processData = useCallback(async () => {
        // Validation
        if (!keys) {
            setInputError(
                "Bangkitkan kunci terlebih dahulu sebelum memproses.",
            );
            return;
        }
        if (inputType === "file" && !fileData) {
            setInputError("Pilih berkas terlebih dahulu.");
            return;
        }
        if (inputType === "text" && mode === "encrypt" && !textInput.trim()) {
            setInputError("Masukkan teks yang ingin dienkripsi.");
            return;
        }
        setInputError(null);
        setProcessing(true);
        setFinished(false);
        setTraceSteps([]);
        setTraceActive(true);
        setShowTrace(false);
        setResultBytes(null);
        setResultText("");

        const isEncrypt = mode === "encrypt";
        let inputBytes: Uint8Array;

        if (inputType === "text") {
            if (isEncrypt) {
                inputBytes = new TextEncoder().encode(textInput);
            } else {
                // For text decryption, expect binary string (output of encrypt)
                try {
                    const bin = textInput.replace(/\s/g, "");
                    if (bin.length % 8 !== 0 || !/^[01]+$/.test(bin))
                        throw new Error();
                    const arr: number[] = [];
                    for (let i = 0; i < bin.length; i += 8) {
                        arr.push(parseInt(bin.slice(i, i + 8), 2));
                    }
                    inputBytes = new Uint8Array(arr);
                } catch {
                    setInputError(
                        "Format tidak valid. Masukkan string biner hasil enkripsi.",
                    );
                    setProcessing(false);
                    setTraceActive(false);
                    return;
                }
            }
        } else {
            if (!fileData) {
                setProcessing(false);
                return;
            }
            // Use raw bytes — no metadata header needed (TXT-only)
            inputBytes = fileData;
        }

        try {
            const output = isEncrypt
                ? await encryptData(inputBytes, keys, addTrace)
                : await decryptData(inputBytes, keys, addTrace);

            if (inputType === "text") {
                setResultBytes(output);
                if (isEncrypt) {
                    const binaryString = Array.from(output)
                        .map((b) => b.toString(2).padStart(8, "0"))
                        .join("");
                    setResultText(binaryString);
                    sessionStorage.setItem(
                        `cf_result_text_${mode}`,
                        binaryString,
                    );
                    sessionStorage.setItem(
                        `cf_result_bytes_${mode}`,
                        uint8ToBase64(output),
                    );
                } else {
                    try {
                        const decoded = new TextDecoder().decode(output);
                        setResultText(decoded);
                        sessionStorage.setItem(
                            `cf_result_text_${mode}`,
                            decoded,
                        );
                        sessionStorage.setItem(
                            `cf_result_bytes_${mode}`,
                            uint8ToBase64(output),
                        );
                    } catch {
                        setResultText(
                            "Gagal decode ASCII, data mungkin korup.",
                        );
                    }
                }
            } else {
                // File mode — raw bytes in/out
                setResultBytes(output);
                sessionStorage.setItem(
                    `cf_result_bytes_${mode}`,
                    uint8ToBase64(output),
                );
            }

            setFinished(true);
        } catch (err) {
            setInputError(
                "Terjadi kesalahan saat memproses data. Periksa kunci dan coba lagi.",
            );
        }

        setProcessing(false);
    }, [keys, mode, inputType, textInput, fileData, addTrace]);

    // Persist trace steps to sessionStorage whenever they are finalized
    useEffect(() => {
        if (finished && traceSteps.length > 0) {
            try {
                sessionStorage.setItem(
                    `cf_trace_${mode}`,
                    JSON.stringify(traceSteps),
                );
            } catch {
                /* quota exceeded */
            }
        }
    }, [finished, traceSteps, mode]);

    const handleFileDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (!file) return;
            const ext = file.name.includes(".")
                ? file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
                : "";
            const validExt = mode === "encrypt" ? ".txt" : ".enc";
            if (ext !== validExt) {
                setInputError(
                    mode === "encrypt"
                        ? "Hanya file .txt yang diterima untuk enkripsi."
                        : "Hanya file .enc yang diterima untuk dekripsi.",
                );
                return;
            }
            setInputError(null);
            setFileName(file.name);
            setOriginalExt(ext);
            setResultBytes(null);
            setFinished(false);
            if (mode === "decrypt") {
                // .enc file contains binary string text — parse it
                file.text().then((text) => {
                    const bin = text.replace(/\s/g, "");
                    if (!/^[01]+$/.test(bin) || bin.length % 8 !== 0) {
                        setInputError(
                            "File .enc tidak berisi data biner yang valid.",
                        );
                        setFileName("");
                        setOriginalExt("");
                        return;
                    }
                    const arr: number[] = [];
                    for (let i = 0; i < bin.length; i += 8)
                        arr.push(parseInt(bin.slice(i, i + 8), 2));
                    const data = new Uint8Array(arr);
                    setFileData(data);
                    saveFileSession(mode, file.name, ext, data);
                });
            } else {
                file.arrayBuffer().then((buf) => {
                    const data = new Uint8Array(buf);
                    setFileData(data);
                    saveFileSession(mode, file.name, ext, data);
                });
            }
        },
        [mode],
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const ext = file.name.includes(".")
                ? file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
                : "";
            const validExt = mode === "encrypt" ? ".txt" : ".enc";
            if (ext !== validExt) {
                setInputError(
                    mode === "encrypt"
                        ? "Hanya file .txt yang diterima untuk enkripsi."
                        : "Hanya file .enc yang diterima untuk dekripsi.",
                );
                // reset input value so same file can be retried
                e.target.value = "";
                return;
            }
            setInputError(null);
            setFileName(file.name);
            setOriginalExt(ext);
            setResultBytes(null);
            setFinished(false);
            if (mode === "decrypt") {
                // .enc file contains binary string text — parse it
                file.text().then((text) => {
                    const bin = text.replace(/\s/g, "");
                    if (!/^[01]+$/.test(bin) || bin.length % 8 !== 0) {
                        setInputError(
                            "File .enc tidak berisi data biner yang valid.",
                        );
                        setFileName("");
                        setOriginalExt("");
                        e.target.value = "";
                        return;
                    }
                    const arr: number[] = [];
                    for (let i = 0; i < bin.length; i += 8)
                        arr.push(parseInt(bin.slice(i, i + 8), 2));
                    const data = new Uint8Array(arr);
                    setFileData(data);
                    saveFileSession(mode, file.name, ext, data);
                });
            } else {
                file.arrayBuffer().then((buf) => {
                    const data = new Uint8Array(buf);
                    setFileData(data);
                    saveFileSession(mode, file.name, ext, data);
                });
            }
        },
        [mode],
    );

    const copyResult = useCallback(() => {
        navigator.clipboard.writeText(resultText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [resultText]);

    const downloadResult = useCallback(() => {
        if (!resultBytes) return;
        const isEncrypt = mode === "encrypt";
        const baseName = fileName
            ? fileName.replace(/\.(txt|enc)$/i, "")
            : isEncrypt
              ? "encrypted"
              : "decrypted";

        let blob: Blob;
        if (isEncrypt) {
            // Save cipher as binary string (0s and 1s) text
            const binaryString = Array.from(resultBytes)
                .map((b) => b.toString(2).padStart(8, "0"))
                .join("");
            blob = new Blob([binaryString], { type: "text/plain" });
        } else {
            const plain = new Uint8Array(resultBytes.length);
            plain.set(resultBytes);
            blob = new Blob([plain.buffer as ArrayBuffer], {
                type: "application/octet-stream",
            });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = isEncrypt ? `${baseName}.enc` : `${baseName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }, [resultBytes, mode, fileName]);

    // Active phases for timeline
    const activePhases = traceSteps.map((s) => s.phase);
    const timelinePhases: {
        key: TraceStep["phase"];
        label: string;
    }[] =
        mode === "encrypt"
            ? [
                  { key: "rsa", label: "RSA Enkripsi" },
                  { key: "fibonacci", label: "Fibonacci XOR" },
                  { key: "permutation", label: "Bit Permutasi" },
              ]
            : [
                  { key: "fibonacci", label: "Inv. Perm + XOR" },
                  { key: "rsa", label: "RSA Dekripsi" },
              ];

    function renderTraceLine(text: string, index: number): React.ReactNode {
        // Section header: "--- Tahap X ---"
        if (text.trimStart().startsWith("---")) {
            const clean = text.replace(/\n/g, "").replace(/---/g, "").trim();
            return (
                <div key={index} className="flex items-center gap-2 pt-4 pb-1">
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="font-heading text-[9px] text-accent uppercase tracking-widest shrink-0 px-1">
                        {clean}
                    </span>
                    <div className="h-px flex-1 bg-border/50" />
                </div>
            );
        }

        // Done line: "✓ ..."
        if (text.startsWith("✓")) {
            return (
                <div key={index} className="flex items-center gap-2 pt-3 pb-1">
                    <CheckCircle2 size={13} className="text-success shrink-0" />
                    <span className="font-heading text-xs text-success font-semibold">
                        {text.slice(2)}
                    </span>
                </div>
            );
        }

        // RSA Char line: "Char 'L' (76) → RSA: 1762359 → Base256: [26, 228, 55]"
        const charMatch = text.match(
            /^Char '(.+)' \((\d+)\) → RSA: (\d+) → Base256: \[(.+)\]/,
        );
        if (charMatch) {
            return (
                <div
                    key={index}
                    className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-0.5 py-1.5 border-b border-border/20 font-heading text-xs"
                >
                    <span className="text-[9px] text-muted-foreground flex items-center">
                        CHAR
                    </span>
                    <span>
                        <span className="text-primary font-bold">
                            &apos;{charMatch[1]}&apos;
                        </span>{" "}
                        <span className="text-muted-foreground">ASCII =</span>{" "}
                        <span className="text-foreground">{charMatch[2]}</span>
                    </span>
                    <span className="text-[9px] text-muted-foreground flex items-center">
                        RSA
                    </span>
                    <span>
                        <span className="text-muted-foreground">
                            {charMatch[2]}
                            <sup>e</sup> mod n ={" "}
                        </span>
                        <span className="text-accent font-semibold">
                            {charMatch[3]}
                        </span>
                    </span>
                    <span className="text-[9px] text-muted-foreground flex items-center">
                        BASE256
                    </span>
                    <span className="text-primary">[{charMatch[4]}]</span>
                </div>
            );
        }

        // Keystream: "Keystream (n=12): 1, 1, 2, 3..."
        const ksMatch = text.match(/^Keystream \(n=(\d+)\): (.+)/);
        if (ksMatch) {
            return (
                <div key={index} className="py-1.5 font-heading text-xs">
                    <span className="text-muted-foreground">
                        Fibonacci[1,1] mod 256 →{" "}
                    </span>
                    <span className="text-accent">{ksMatch[2]}</span>
                    <span className="text-muted-foreground">
                        {" "}
                        … ({ksMatch[1]} nilai)
                    </span>
                </div>
            );
        }

        // Encryption XOR byte: "Byte 1 | RSA=26 | ks=1 | y_prev=38 | XOR=61 | Cipher=10111100"
        const encByteMatch = text.match(
            /^Byte (\d+) \| RSA=(\d+) \| ks=(\d+) \| y_prev=(\d+) \| XOR=(\d+) \| Cipher=([01]+)/,
        );
        if (encByteMatch) {
            const [, idx, rsa, ks, yp, xr, cipher] = encByteMatch;
            const cells = [
                { label: "RSA xᵢ", val: rsa, color: "text-primary" },
                { label: "ks[i]", val: ks, color: "text-accent" },
                { label: "y_prev", val: yp, color: "text-foreground/70" },
                { label: "XOR res", val: xr, color: "text-foreground" },
                {
                    label: "Cipher yᵢ",
                    val: cipher,
                    color: "text-success font-mono text-[8px]",
                },
            ];
            return (
                <div key={index} className="py-1.5 border-b border-border/20">
                    <div className="font-heading text-[9px] text-muted-foreground mb-1">
                        Byte {idx}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                        {cells.map(({ label, val, color }) => (
                            <div
                                key={label}
                                className="rounded bg-secondary/80 px-1 py-1 text-center"
                            >
                                <div className="font-heading text-[8px] text-muted-foreground mb-0.5">
                                    {label}
                                </div>
                                <div
                                    className={`font-heading text-[10px] ${color}`}
                                >
                                    {val}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // Decryption byte: "Byte 1: Cipher(188) → InvPerm: 61 ⊕ Prev: 38 ⊕ Fib: 1 = RSA Byte: 26"
        const decByteMatch = text.match(
            /^Byte (\d+): Cipher\((\d+)\) → InvPerm: (\d+) ⊕ Prev: (\d+) ⊕ Fib: (\d+) = RSA Byte: (\d+)/,
        );
        if (decByteMatch) {
            const [, idx, cipher, invp, prev, fib, rsab] = decByteMatch;
            const cells = [
                { label: "Cipher yᵢ", val: cipher, color: "text-primary" },
                { label: "InvPerm", val: invp, color: "text-accent" },
                { label: "y_prev", val: prev, color: "text-foreground/70" },
                { label: "Fib ksᵢ", val: fib, color: "text-foreground" },
                { label: "RSA Byte xᵢ", val: rsab, color: "text-success" },
            ];
            return (
                <div key={index} className="py-1.5 border-b border-border/20">
                    <div className="font-heading text-[9px] text-muted-foreground mb-1">
                        Byte {idx}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                        {cells.map(({ label, val, color }) => (
                            <div
                                key={label}
                                className="rounded bg-secondary/80 px-1 py-1 text-center"
                            >
                                <div className="font-heading text-[8px] text-muted-foreground mb-0.5">
                                    {label}
                                </div>
                                <div
                                    className={`font-heading text-[10px] ${color}`}
                                >
                                    {val}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // RSA Block: "Blok [26,228,55] → Int: 1762359 → RSA Dec: 76 ('L')"
        const blokMatch = text.match(
            /^Blok \[(.+)\] → Int: (\d+) → RSA Dec: (\d+) \('(.+)'\)/,
        );
        if (blokMatch) {
            return (
                <div
                    key={index}
                    className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-0.5 py-1.5 border-b border-border/20 font-heading text-xs"
                >
                    <span className="text-[9px] text-muted-foreground flex items-center">
                        BLOK
                    </span>
                    <span className="text-primary">[{blokMatch[1]}]</span>
                    <span className="text-[9px] text-muted-foreground flex items-center">
                        INT
                    </span>
                    <span>
                        <span className="text-accent font-semibold">
                            {blokMatch[2]}
                        </span>
                        <span className="text-muted-foreground">
                            {" "}
                            (basis 256 → desimal)
                        </span>
                    </span>
                    <span className="text-[9px] text-muted-foreground flex items-center">
                        CHAR
                    </span>
                    <span>
                        <span className="text-success font-bold">
                            &apos;{blokMatch[4]}&apos;
                        </span>
                        <span className="text-muted-foreground"> ASCII = </span>
                        <span className="text-foreground">{blokMatch[3]}</span>
                    </span>
                </div>
            );
        }

        // Empty lines / fallback
        if (!text.trim()) return null;
        return (
            <p
                key={index}
                className="font-heading text-[10px] text-muted-foreground/50 py-0.5"
            >
                {text}
            </p>
        );
    }

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
                                title={
                                    m === "encrypt"
                                        ? "Mode enkripsi: ubah plaintext menjadi ciphertext"
                                        : "Mode dekripsi: pulihkan plaintext dari ciphertext"
                                }
                                onClick={() => {
                                    // Persist file and text of current mode before switching
                                    if (fileData && fileName) {
                                        saveFileSession(
                                            mode,
                                            fileName,
                                            originalExt,
                                            fileData,
                                        );
                                    }
                                    if (textInput) {
                                        sessionStorage.setItem(
                                            `cf_text_${mode}`,
                                            textInput,
                                        );
                                    }
                                    sessionStorage.setItem("cf_mode", m);
                                    setMode(m);
                                    setShowTrace(false);
                                    setInputError(null);
                                    // Restore text for the new mode
                                    const savedText = sessionStorage.getItem(
                                        `cf_text_${m}`,
                                    );
                                    setTextInput(savedText ?? "");
                                    // Restore file for the new mode
                                    const saved = loadFileSession(m);
                                    if (saved) {
                                        setFileName(saved.name);
                                        setOriginalExt(saved.ext);
                                        setFileData(saved.data);
                                        setInputType("file");
                                    } else {
                                        setFileName("");
                                        setFileData(null);
                                        setOriginalExt("");
                                    }
                                    // Restore output for the new mode
                                    const savedRT = sessionStorage.getItem(
                                        `cf_result_text_${m}`,
                                    );
                                    const savedRB = sessionStorage.getItem(
                                        `cf_result_bytes_${m}`,
                                    );
                                    if (savedRT || savedRB) {
                                        setResultText(savedRT ?? "");
                                        setResultBytes(
                                            savedRB
                                                ? base64ToUint8(savedRB)
                                                : null,
                                        );
                                        setFinished(true);
                                    } else {
                                        setResultText("");
                                        setResultBytes(null);
                                        setFinished(false);
                                    }
                                    // Restore trace steps for the new mode
                                    const savedTrace = sessionStorage.getItem(
                                        `cf_trace_${m}`,
                                    );
                                    if (savedTrace) {
                                        try {
                                            const parsed = JSON.parse(
                                                savedTrace,
                                            ) as TraceStep[];
                                            if (parsed.length > 0) {
                                                setTraceSteps(parsed);
                                                setTraceActive(true);
                                            } else {
                                                setTraceSteps([]);
                                                setTraceActive(false);
                                            }
                                        } catch {
                                            setTraceSteps([]);
                                            setTraceActive(false);
                                        }
                                    } else {
                                        setTraceSteps([]);
                                        setTraceActive(false);
                                    }
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
                                title={
                                    t === "text"
                                        ? "Input berupa teks"
                                        : "Input berupa berkas"
                                }
                                onClick={() => setInputType(t)}
                                className={`font-heading text-xs tracking-wide uppercase transition-colors ${
                                    inputType === t
                                        ? "text-primary"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {t === "text" ? "Teks" : "File"}
                            </button>
                        ))}
                    </div>

                    {/* Input Area */}
                    {inputType === "text" ? (
                        <div className="relative mb-6">
                            <textarea
                                value={textInput}
                                onChange={(e) => {
                                    setTextInput(e.target.value);
                                    sessionStorage.setItem(
                                        `cf_text_${mode}`,
                                        e.target.value,
                                    );
                                    if (inputError) setInputError(null);
                                }}
                                placeholder="Masukkan pesan di sini..."
                                rows={5}
                                className="w-full rounded-md border border-border bg-secondary px-4 py-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                            />
                        </div>
                    ) : (
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragOver(true);
                            }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleFileDrop}
                            className={`rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors mb-3 ${
                                isDragOver
                                    ? "border-primary bg-primary/5"
                                    : fileData
                                      ? "border-primary/50 bg-primary/5"
                                      : "border-border"
                            }`}
                        >
                            <Upload
                                className={`mx-auto mb-3 ${
                                    fileData
                                        ? "text-primary"
                                        : "text-muted-foreground"
                                }`}
                                size={28}
                            />
                            <p className="font-body text-sm text-muted-foreground mb-1">
                                {fileName || "Seret berkas ke sini"}
                            </p>
                            <p className="font-body text-xs text-muted-foreground/50 mb-3">
                                {mode === "encrypt"
                                    ? "Hanya file .txt yang diterima"
                                    : "Hanya file .enc yang diterima"}
                            </p>
                            <div className="flex items-center justify-center gap-3">
                                <input
                                    type="file"
                                    accept={
                                        mode === "encrypt" ? ".txt" : ".enc"
                                    }
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="file-input"
                                />
                                <label
                                    htmlFor="file-input"
                                    className="inline-block cursor-pointer font-body text-xs text-primary hover:underline"
                                    title="Klik untuk memilih berkas dari komputer"
                                >
                                    Pilih Berkas
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Process Button + Error */}
                    <div className="mt-6">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={processData}
                                disabled={processing}
                                title={
                                    processing
                                        ? "Sedang memproses data..."
                                        : mode === "encrypt"
                                          ? "Mulai proses enkripsi data"
                                          : "Mulai proses dekripsi data"
                                }
                                className={`rounded-md px-6 py-3 font-body text-sm font-semibold transition-all ${
                                    processing
                                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                                        : "bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98]"
                                }`}
                            >
                                {processing
                                    ? "Memproses..."
                                    : "Proses Sekarang"}
                            </button>

                            {/* Hapus input */}
                            {(textInput || fileData) && !processing && (
                                <button
                                    type="button"
                                    title="Hapus input yang dimasukkan"
                                    onClick={() => {
                                        if (inputType === "text") {
                                            setTextInput("");
                                            sessionStorage.removeItem(
                                                `cf_text_${mode}`,
                                            );
                                        } else {
                                            setFileData(null);
                                            setFileName("");
                                            setOriginalExt("");
                                            clearFileSession(mode);
                                        }
                                        setInputError(null);
                                    }}
                                    className="rounded-md border border-destructive/60 px-4 py-3 font-body text-sm font-medium text-destructive transition-all hover:bg-destructive/10"
                                >
                                    Hapus
                                </button>
                            )}
                        </div>

                        <AnimatePresence>
                            {inputError && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="mt-2 font-body text-xs text-destructive"
                                >
                                    ⚠ {inputError}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Process Visualization */}
                    <AnimatePresence>
                        {traceActive && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.4 }}
                                className="mt-6"
                            >
                                {/* Phase timeline — always visible */}
                                <div className="mb-5">
                                    {/* Mode badge */}
                                    <div className="flex justify-center mb-5">
                                        <span
                                            className={`font-heading text-[10px] px-3 py-1 rounded-full border ${
                                                mode === "encrypt"
                                                    ? "border-primary/40 bg-primary/10 text-primary"
                                                    : "border-accent/40 bg-accent/10 text-accent"
                                            }`}
                                        >
                                            {mode === "encrypt"
                                                ? "↓ Alur Enkripsi"
                                                : "↑ Alur Dekripsi"}
                                        </span>
                                    </div>

                                    {/* Three-row layout: numbers / circles+lines / labels */}
                                    <div
                                        className={`mx-auto ${timelinePhases.length === 2 ? "max-w-xs" : "max-w-sm"}`}
                                    >
                                        {/* Row 1 — step numbers */}
                                        <div className="flex items-center mb-1.5">
                                            {timelinePhases.map((phase, i) => {
                                                const isActive =
                                                    activePhases.includes(
                                                        phase.key,
                                                    );
                                                const colorClass =
                                                    mode === "encrypt"
                                                        ? "text-primary"
                                                        : "text-accent";
                                                return (
                                                    <>
                                                        <div
                                                            key={`n-${phase.key}`}
                                                            className="flex-shrink-0 w-12 text-center"
                                                        >
                                                            <span
                                                                className={`font-heading text-[9px] ${isActive ? colorClass : "text-muted-foreground/35"}`}
                                                            >
                                                                {String(
                                                                    i + 1,
                                                                ).padStart(
                                                                    2,
                                                                    "0",
                                                                )}
                                                            </span>
                                                        </div>
                                                        {i <
                                                            timelinePhases.length -
                                                                1 && (
                                                            <div
                                                                key={`ns-${i}`}
                                                                className="flex-1"
                                                            />
                                                        )}
                                                    </>
                                                );
                                            })}
                                        </div>

                                        {/* Row 2 — circles + connecting lines */}
                                        <div className="flex items-center">
                                            {timelinePhases.map((phase, i) => {
                                                const isActive =
                                                    activePhases.includes(
                                                        phase.key,
                                                    );
                                                const isDone =
                                                    finished ||
                                                    timelinePhases
                                                        .slice(i + 1)
                                                        .some((t) =>
                                                            activePhases.includes(
                                                                t.key,
                                                            ),
                                                        );
                                                const isPulsing =
                                                    processing &&
                                                    isActive &&
                                                    !isDone;
                                                const Icon =
                                                    phaseIcons[phase.key];
                                                const accentBorder =
                                                    mode === "encrypt"
                                                        ? "border-primary bg-primary/10"
                                                        : "border-accent bg-accent/10";
                                                const iconColor =
                                                    mode === "encrypt"
                                                        ? "text-primary"
                                                        : "text-accent";
                                                const glowBg =
                                                    mode === "encrypt"
                                                        ? "bg-primary"
                                                        : "bg-accent";
                                                const lineFill =
                                                    mode === "encrypt"
                                                        ? "bg-primary"
                                                        : "bg-accent";
                                                return (
                                                    <>
                                                        {/* Circle */}
                                                        <div
                                                            key={phase.key}
                                                            className="relative flex-shrink-0"
                                                        >
                                                            {isPulsing && (
                                                                <motion.div
                                                                    animate={{
                                                                        scale: [
                                                                            1,
                                                                            1.9,
                                                                        ],
                                                                        opacity:
                                                                            [
                                                                                0.45,
                                                                                0,
                                                                            ],
                                                                    }}
                                                                    transition={{
                                                                        repeat: Infinity,
                                                                        duration: 1.2,
                                                                    }}
                                                                    className={`absolute inset-0 rounded-full ${glowBg}`}
                                                                />
                                                            )}
                                                            <motion.div
                                                                animate={
                                                                    isPulsing
                                                                        ? {
                                                                              scale: [
                                                                                  1,
                                                                                  1.1,
                                                                                  1,
                                                                              ],
                                                                          }
                                                                        : {
                                                                              scale: isActive
                                                                                  ? 1
                                                                                  : 0.8,
                                                                              opacity:
                                                                                  isActive
                                                                                      ? 1
                                                                                      : 0.25,
                                                                          }
                                                                }
                                                                transition={
                                                                    isPulsing
                                                                        ? {
                                                                              repeat: Infinity,
                                                                              duration: 1.1,
                                                                              ease: "easeInOut",
                                                                          }
                                                                        : {}
                                                                }
                                                                className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                                    isDone &&
                                                                    isActive
                                                                        ? "border-success bg-success/10"
                                                                        : isActive
                                                                          ? accentBorder
                                                                          : "border-border bg-secondary"
                                                                }`}
                                                            >
                                                                <Icon
                                                                    size={20}
                                                                    className={
                                                                        isDone &&
                                                                        isActive
                                                                            ? "text-success"
                                                                            : isActive
                                                                              ? iconColor
                                                                              : "text-muted-foreground/30"
                                                                    }
                                                                />
                                                            </motion.div>
                                                        </div>

                                                        {/* Connecting line */}
                                                        {i <
                                                            timelinePhases.length -
                                                                1 && (
                                                            <div
                                                                key={`l-${i}`}
                                                                className="relative flex-1 h-0.5 mx-3 overflow-hidden rounded-full"
                                                            >
                                                                <div className="absolute inset-0 bg-border/50" />
                                                                <motion.div
                                                                    initial={{
                                                                        scaleX: 0,
                                                                    }}
                                                                    animate={{
                                                                        scaleX: activePhases.includes(
                                                                            timelinePhases[
                                                                                i +
                                                                                    1
                                                                            ]
                                                                                .key,
                                                                        )
                                                                            ? 1
                                                                            : 0,
                                                                    }}
                                                                    transition={{
                                                                        duration: 0.55,
                                                                        ease: "easeInOut",
                                                                    }}
                                                                    style={{
                                                                        transformOrigin:
                                                                            "left",
                                                                    }}
                                                                    className={`absolute inset-0 ${lineFill}`}
                                                                />
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })}
                                        </div>

                                        {/* Row 3 — labels */}
                                        <div className="flex items-start mt-2.5">
                                            {timelinePhases.map((phase, i) => {
                                                const isActive =
                                                    activePhases.includes(
                                                        phase.key,
                                                    );
                                                return (
                                                    <>
                                                        <div
                                                            key={`lb-${phase.key}`}
                                                            className="flex-shrink-0 w-12 flex flex-col items-center text-center"
                                                        >
                                                            <span
                                                                className={`font-heading text-[10px] leading-tight ${isActive ? "text-foreground" : "text-muted-foreground/35"}`}
                                                            >
                                                                {phase.label}
                                                            </span>
                                                        </div>
                                                        {i <
                                                            timelinePhases.length -
                                                                1 && (
                                                            <div
                                                                key={`ls-${i}`}
                                                                className="flex-1"
                                                            />
                                                        )}
                                                    </>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Scanning progress bar while processing */}
                                {processing && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex items-center mb-3 overflow-hidden"
                                    >
                                        <motion.div
                                            animate={{ x: ["-100%", "100%"] }}
                                            transition={{
                                                repeat: Infinity,
                                                duration: 1.4,
                                                ease: "linear",
                                            }}
                                            className="h-px flex-1 bg-gradient-to-r from-transparent via-primary to-transparent"
                                        />
                                    </motion.div>
                                )}

                                {/* Toggle button */}
                                <button
                                    onClick={() => setShowTrace((v) => !v)}
                                    title={
                                        showTrace
                                            ? "Sembunyikan detail langkah perhitungan"
                                            : "Tampilkan detail setiap langkah perhitungan kriptografi"
                                    }
                                    className={`w-full flex items-center justify-between rounded-md border px-4 py-3 font-heading text-xs transition-all duration-200 ${
                                        showTrace
                                            ? "border-primary/50 bg-primary/10 text-primary"
                                            : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/60"
                                    }`}
                                >
                                    <span className="flex items-center gap-2 font-semibold tracking-wide">
                                        <Eye size={14} />
                                        {showTrace
                                            ? "Sembunyikan Detail Proses"
                                            : "Lihat Detail Proses"}
                                    </span>
                                    <span className="font-heading text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                                        {traceSteps.length} langkah
                                    </span>
                                </button>

                                {/* Detailed trace — hidden until toggled */}
                                <AnimatePresence>
                                    {showTrace && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{
                                                opacity: 1,
                                                height: "auto",
                                            }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="overflow-hidden"
                                        >
                                            <div
                                                className={`mt-3 rounded-md border transition-all ${
                                                    processing
                                                        ? "border-primary/40"
                                                        : "border-border"
                                                } bg-card`}
                                            >
                                                {/* Header bar */}
                                                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                                                    <h3 className="font-heading text-[9px] text-muted-foreground uppercase tracking-widest">
                                                        Jejak Perhitungan
                                                    </h3>
                                                    {processing && (
                                                        <motion.div
                                                            animate={{
                                                                opacity: [
                                                                    1, 0.2, 1,
                                                                ],
                                                            }}
                                                            transition={{
                                                                repeat: Infinity,
                                                                duration: 0.9,
                                                            }}
                                                            className="flex items-center gap-1"
                                                        >
                                                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                            <span className="font-heading text-[8px] text-primary">
                                                                LIVE
                                                            </span>
                                                        </motion.div>
                                                    )}
                                                </div>
                                                {/* Trace content */}
                                                <div className="px-4 py-3 max-h-[420px] overflow-y-auto">
                                                    {traceSteps.map((step, i) =>
                                                        renderTraceLine(
                                                            step.text,
                                                            i,
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
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
                                    <CheckCircle2
                                        className="text-success shrink-0"
                                        size={22}
                                    />
                                    <div className="flex-1">
                                        <p className="font-body text-sm font-semibold text-success">
                                            {mode === "encrypt"
                                                ? "Enkripsi Berhasil!"
                                                : "Dekripsi Berhasil!"}
                                        </p>
                                        <p className="font-body text-xs text-muted-foreground">
                                            Keamanan Optimal, Data diproses
                                            melalui 3 lapisan kriptografi
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        title="Hapus hasil output"
                                        onClick={() => {
                                            setResultBytes(null);
                                            setResultText("");
                                            setFinished(false);
                                            sessionStorage.removeItem(
                                                `cf_result_text_${mode}`,
                                            );
                                            sessionStorage.removeItem(
                                                `cf_result_bytes_${mode}`,
                                            );
                                            sessionStorage.removeItem(
                                                `cf_trace_${mode}`,
                                            );
                                            setTraceSteps([]);
                                            setTraceActive(false);
                                        }}
                                        className="rounded-md border border-destructive/50 px-3 py-1.5 font-body text-xs text-destructive hover:bg-destructive/10 transition-all shrink-0"
                                    >
                                        Hapus Output
                                    </button>
                                </div>

                                {/* Text result */}
                                {inputType === "text" && resultText && (
                                    <div className="mb-4">
                                        <label className="block font-heading text-xs text-muted-foreground mb-2">
                                            Hasil
                                        </label>
                                        <div className="relative">
                                            <textarea
                                                readOnly
                                                value={resultText}
                                                rows={4}
                                                className="w-full rounded-md border border-border bg-secondary px-4 pt-3 pb-10 font-heading text-xs text-foreground resize-none"
                                            />
                                            <div className="absolute bottom-2 right-2">
                                                <button
                                                    onClick={copyResult}
                                                    title={
                                                        copied
                                                            ? "Teks sudah tersalin ke clipboard"
                                                            : "Salin hasil ke clipboard"
                                                    }
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded font-heading text-xs font-medium transition-all duration-200 ${
                                                        copied
                                                            ? "bg-success/20 text-success border border-success/40"
                                                            : "bg-secondary text-muted-foreground hover:text-primary border border-border hover:border-primary/50"
                                                    }`}
                                                >
                                                    {copied ? (
                                                        <>
                                                            <Check size={12} />
                                                            <span>
                                                                Tersalin!
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={12} />
                                                            <span>Salin</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Download button */}
                                {resultBytes && resultBytes.length > 0 && (
                                    <button
                                        onClick={downloadResult}
                                        title={
                                            mode === "encrypt"
                                                ? "Unduh berkas hasil enkripsi (.enc)"
                                                : "Unduh berkas hasil dekripsi (.txt)"
                                        }
                                        className="w-full rounded-md border-2 border-accent bg-accent/10 px-6 py-4 font-body text-sm font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.99] download-glow flex items-center justify-center gap-2"
                                    >
                                        <Download size={18} />
                                        {mode === "encrypt"
                                            ? "Unduh Berkas Terenkripsi"
                                            : "Unduh Berkas Terdekripsi"}
                                        <span className="text-xs font-normal text-muted-foreground ml-1">
                                            (
                                            {mode === "encrypt"
                                                ? ".enc"
                                                : ".txt"}
                                            )
                                        </span>
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
