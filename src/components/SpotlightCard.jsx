import { useRef, useState } from "react";

export default function SpotlightCard({ children, className = "" }) {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty("--x", `${x}px`);
    cardRef.current.style.setProperty("--y", `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`spotlight-card ${isHovered ? "hovered" : ""} ${className}`}
    >
      {/* Glowing Border Mask */}
      <div className="spotlight-border" />
      {/* Subtle interior glow */}
      <div className="spotlight-glow" />
      
      {/* Content wrapper */}
      <div className="spotlight-content">
        {children}
      </div>
    </div>
  );
}
