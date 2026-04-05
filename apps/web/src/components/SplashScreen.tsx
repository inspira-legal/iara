export function SplashScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-zinc-950">
      <div className="flex gap-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-zinc-100"
            style={{
              animation: "splash-dot 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes splash-dot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
