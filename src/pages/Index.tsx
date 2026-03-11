import { useState, useCallback } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import KeyGeneration from "@/components/KeyGeneration";
import CoreFunction from "@/components/CoreFunction";
import type { KeyData } from "@/lib/crypto";

const Index = () => {
    const [keys, setKeys] = useState<KeyData | null>(null);

    const handleKeysGenerated = useCallback((newKeys: KeyData) => {
        setKeys(newKeys);
    }, []);

    const handleKeysCleared = useCallback(() => {
        setKeys(null);
    }, []);

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <HeroSection />
            <KeyGeneration
                onKeysGenerated={handleKeysGenerated}
                onKeysCleared={handleKeysCleared}
            />
            <CoreFunction keys={keys} />
            <footer className="border-t border-border py-8 text-center">
                <p className="font-body text-xs text-muted-foreground">
                    KriptoSecure — Sistem Kriptografi Multi-Prime RSA &
                    Fibonacci
                </p>
            </footer>
        </div>
    );
};

export default Index;
