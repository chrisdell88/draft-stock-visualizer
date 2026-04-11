import { useState } from "react";
import { Copy, Check, Twitter, MessageSquare, Mail } from "lucide-react";

export default function Footer() {
  const [copied, setCopied] = useState(false);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleShareX() {
    const text = encodeURIComponent("MockX — The AI-Powered NFL Draft Board. mockx.co");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(window.location.href)}`, "_blank");
  }

  function handleShareText() {
    const body = encodeURIComponent(`Check out MockX — The AI-Powered NFL Draft Board: ${window.location.href}`);
    window.location.href = `sms:?body=${body}`;
  }

  function handleShareEmail() {
    const subject = encodeURIComponent("MockX — NFL Draft Board");
    const body = encodeURIComponent(`Check out MockX — The AI-Powered NFL Draft Board:\n\n${window.location.href}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <footer className="border-t border-white/10 bg-[#0a0c10] mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top row: branding + share buttons + founder */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left: MOCKX branding */}
          <div className="flex flex-col items-center md:items-start gap-1">
            <span
              className="text-2xl font-black tracking-tight"
              style={{ fontFamily: "'Outfit', sans-serif", color: "#00d4ff" }}
            >
              MOCKX
            </span>
            <span className="text-[11px] text-white/40 font-mono uppercase tracking-widest">
              Part of the BallerX family
            </span>
          </div>

          {/* Center: Share buttons */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40 font-mono uppercase tracking-widest mr-2">Share</span>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
              style={{ background: "#0e3d3d", borderColor: "#00d4ff40", color: "#00d4ff" }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={handleShareX}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
              style={{ background: "#0d1e3d", borderColor: "#3b82f640", color: "#60a5fa" }}
            >
              <Twitter className="w-3 h-3" />
              X
            </button>
            <button
              onClick={handleShareText}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
              style={{ background: "#0d3320", borderColor: "#22c55e40", color: "#4ade80" }}
            >
              <MessageSquare className="w-3 h-3" />
              Text
            </button>
            <button
              onClick={handleShareEmail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
              style={{ background: "#3d1a0d", borderColor: "#f9731640", color: "#fb923c" }}
            >
              <Mail className="w-3 h-3" />
              Email
            </button>
          </div>

          {/* Right: Founder */}
          <div className="flex flex-col items-center md:items-end gap-1">
            <span className="text-[11px] text-white/40 font-mono uppercase tracking-widest">Founder</span>
            <span className="text-sm font-semibold text-white/80 font-mono">Chris Dell</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 my-6" />

        {/* Bottom row: site links + copyright */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <a
              href="https://mockx.co"
              className="text-xs font-mono text-white/50 hover:text-[#00d4ff] transition-colors"
            >
              MockX.co
            </a>
            <span className="text-white/20 text-xs">|</span>
            <a
              href="https://bracketx.co"
              className="text-xs font-mono text-white/50 hover:text-[#ffd600] transition-colors"
            >
              BracketX.co
            </a>
            <span className="text-white/20 text-xs">|</span>
            <a
              href="https://birdiex.co"
              className="text-xs font-mono text-white/50 hover:text-[#4ade80] transition-colors"
            >
              BirdieX.co
            </a>
          </div>
          <p className="text-[11px] text-white/25 font-mono">
            © 2026 MockX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
