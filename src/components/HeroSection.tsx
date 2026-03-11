const HeroSection = () => {
  return (
    <section className="pt-32 pb-16 px-4">
      <div className="container max-w-3xl">
        <h1 className="font-heading text-3xl md:text-4xl font-bold leading-tight tracking-tight text-foreground">
          Sistem Enkripsi{" "}
          <span className="text-primary">Multi-Prime RSA</span> +{" "}
          <span className="text-primary">Fibonacci</span> Stream Cipher
        </h1>
        <p className="mt-6 font-body text-base text-muted-foreground leading-relaxed max-w-2xl">
          Keamanan berlapis yang menggabungkan kekuatan kriptografi asimetris Multi-Prime RSA 
          dengan Fibonacci Stream Cipher untuk perlindungan data yang komprehensif. 
          Setiap pesan dienkripsi melalui dua lapisan keamanan independen.
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
